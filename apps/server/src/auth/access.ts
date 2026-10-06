import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { SettingsStore } from '../settings/store.ts'
import { type Account, getAccount, restoreAccount, suspendAccount } from './accounts.ts'
import { isInvited } from './invites.ts'
import { ADMIN_ROLE, type RoleIdentity, type Roles } from './roles.ts'

export const inviteOnlyMessage = (did: string) =>
  `This server is invite-only. Ask an admin to add you, and give them your DID: ${did}`

export const closedMessage = (did: string) =>
  `This server isn't taking new accounts. Ask an admin to add you, and give them your DID: ${did}`

/** Shown to suspended users. The reason is an admin note and never part of it. */
export const SUSPENDED_MESSAGE = 'Your account has been suspended. Contact an admin for details.'

export const SIGN_IN_AGAIN_MESSAGE = 'Sign in again to start using chat.'

export type AccessLevel = 'full' | 'viewer'

export class CannotSuspendAdmin extends Error {
  constructor(did: string) {
    super(`${did} is an admin, and admins can't be suspended. Remove the admin role first.`)
    this.name = 'CannotSuspendAdmin'
  }
}

export type AccessDeps = { db: Db; roles: Roles; settings: SettingsStore; logger: Logger }

/** Who may create an account, who has access, and suspending accounts. */
export class Access {
  private readonly deps: AccessDeps

  constructor(deps: AccessDeps) {
    this.deps = deps
  }

  /** May someone with these roles create an account under the registration mode? */
  async mayRegister(did: string, roles: string[]): Promise<boolean> {
    if (roles.includes(ADMIN_ROLE)) return true
    const { registration, inviteRoles } = this.deps.settings.get('access')
    if (registration === 'open' || (await isInvited(this.deps.db, did))) return true
    return registration === 'invite' && roles.some((role) => inviteRoles.includes(role))
  }

  /** Can this user sign in to the chat app, given their account, if any, and roles? */
  async allowsSignIn(did: string, account: Account | undefined, roles: string[]) {
    if (roles.includes(ADMIN_ROLE)) return true
    if (account?.suspension) return false
    if (account && !account.viewerOnly) return true
    return this.mayRegister(did, roles)
  }

  /** The account's roles, and whether it may use the chat app or only view shared chats. */
  async forAccount(account: Account): Promise<{ roles: string[]; access: AccessLevel }> {
    const roles = await this.deps.roles.rolesFor(account)
    const full = roles.includes(ADMIN_ROLE) || (!account.viewerOnly && account.suspension === null)
    return { roles, access: full ? 'full' : 'viewer' }
  }

  /** Why a user can't use the chat app. */
  async deniedMessage(did: string, account: Account | undefined, roles: string[]) {
    if (account?.suspension) return SUSPENDED_MESSAGE
    if (await this.mayRegister(did, roles)) return SIGN_IN_AGAIN_MESSAGE
    return this.deps.settings.get('access').registration === 'closed'
      ? closedMessage(did)
      : inviteOnlyMessage(did)
  }

  /** The roles of a DID, using its account for the handle and PDS when it has one. */
  async rolesForDid(did: string): Promise<string[]> {
    const account = await getAccount(this.deps.db, did)
    return this.deps.roles.rolesFor(account ?? ({ did, handle: null, pdsUrl: '' } as RoleIdentity))
  }

  /** May the server act for this DID in the background? */
  async hasAccess(did: string): Promise<boolean> {
    const account = await getAccount(this.deps.db, did)
    return account ? (await this.forAccount(account)).access === 'full' : false
  }

  /** Suspend an account, by an admin's DID or plugin:<id>. Returns whether it changed. */
  async suspend(did: string, by: string, reason?: string): Promise<boolean> {
    if ((await this.rolesForDid(did)).includes(ADMIN_ROLE)) throw new CannotSuspendAdmin(did)
    const changed = await suspendAccount(this.deps.db, did, by, reason)
    if (changed) this.deps.logger.info({ did, by }, 'account suspended')
    return changed
  }

  async restore(did: string, by: string): Promise<boolean> {
    const changed = await restoreAccount(this.deps.db, did)
    if (changed) this.deps.logger.info({ did, by }, 'account restored')
    return changed
  }
}
