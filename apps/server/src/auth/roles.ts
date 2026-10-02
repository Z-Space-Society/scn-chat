import type { Logger, RoleIdentity, RoleSource } from '@scn-chat/plugin-api'
import type { Db } from '../db/index.ts'

export const IMPLICIT_ROLE = 'user'
export const ADMIN_ROLE = 'admin'

/** Where a role came from: the environment, an explicit membership, a PDS host, a handle domain, or a role source. */
export type RoleGrant = { role: string; source: string }

export const ROLE_SOURCE_TIMEOUT_MS = 2000

export type RolesDeps = {
  db: Db
  adminDids: ReadonlySet<string>
  /** The role sources plugins registered, from the current plugin runtime. */
  sources: () => RoleSource[]
  logger: Logger
  sourceTimeoutMs?: number
}

const parseList = (json: string) => JSON.parse(json) as string[]

const pdsHost = (pdsUrl: string) =>
  URL.canParse(pdsUrl) ? new URL(pdsUrl).hostname.toLowerCase() : undefined

const inDomain = (handle: string, domain: string) =>
  handle === domain || handle.endsWith(`.${domain}`)

/** Which roles a user holds, from the database, the environment, and plugin role sources. */
export class Roles {
  private readonly deps: RolesDeps

  constructor(deps: RolesDeps) {
    this.deps = deps
  }

  isEnvironmentAdmin(did: string): boolean {
    return this.deps.adminDids.has(did)
  }

  environmentAdmins(): ReadonlySet<string> {
    return this.deps.adminDids
  }

  /** Every role name that exists, including the implicit one. */
  async names(): Promise<Set<string>> {
    const rows = await this.deps.db.selectFrom('role').select('name').execute()
    return new Set([IMPLICIT_ROLE, ...rows.map((row) => row.name)])
  }

  /** Each role the user holds with where it came from. The implicit role is left out. */
  async grantsFor(identity: RoleIdentity): Promise<RoleGrant[]> {
    const { db } = this.deps
    const grants: RoleGrant[] = []
    if (this.isEnvironmentAdmin(identity.did))
      grants.push({ role: ADMIN_ROLE, source: 'environment' })
    const [members, roles] = await Promise.all([
      db.selectFrom('role_member').select('role').where('did', '=', identity.did).execute(),
      db.selectFrom('role').select(['name', 'pds_hosts_json', 'handle_domains_json']).execute(),
    ])
    for (const { role } of members) grants.push({ role, source: 'member' })
    const host = pdsHost(identity.pdsUrl)
    const handle = identity.handle?.toLowerCase()
    for (const role of roles) {
      const matchedHost = host && parseList(role.pds_hosts_json).find((h) => h === host)
      if (matchedHost) grants.push({ role: role.name, source: `pds:${matchedHost}` })
      const domain = handle && parseList(role.handle_domains_json).find((d) => inDomain(handle, d))
      if (domain) grants.push({ role: role.name, source: `handle:${domain}` })
    }
    const known = new Set(roles.map((role) => role.name))
    for (const source of this.deps.sources()) {
      for (const role of await this.ask(source, identity)) {
        if (role === ADMIN_ROLE || !known.has(role)) {
          this.deps.logger.warn(
            { source: source.id, role, did: identity.did },
            'ignoring a role a role source cannot grant',
          )
          continue
        }
        grants.push({ role, source: `plugin:${source.id}` })
      }
    }
    return grants
  }

  /** The implicit role plus every role the user holds. */
  async rolesFor(identity: RoleIdentity): Promise<string[]> {
    const grants = await this.grantsFor(identity)
    return [IMPLICIT_ROLE, ...new Set(grants.map((grant) => grant.role))]
  }

  /** A role source's answer, or none when it fails or takes too long. */
  private async ask(source: RoleSource, identity: RoleIdentity): Promise<string[]> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('timed out')),
        this.deps.sourceTimeoutMs ?? ROLE_SOURCE_TIMEOUT_MS,
      )
    })
    try {
      const roles = await Promise.race([source.rolesFor(identity), timeout])
      return Array.isArray(roles) ? roles.filter((role) => typeof role === 'string') : []
    } catch (err) {
      this.deps.logger.warn({ err, source: source.id, did: identity.did }, 'role source failed')
      return []
    } finally {
      clearTimeout(timer)
    }
  }
}
