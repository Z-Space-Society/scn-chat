import type { Db } from '../db/index.ts'

export const IMPLICIT_ROLE = 'user'
export const ADMIN_ROLE = 'admin'

/** Whose roles to work out: their DID, verified handle, and PDS. */
export type RoleIdentity = { did: string; handle?: string | null; pdsUrl: string }

/** Where a role came from: the environment, an explicit membership, a PDS host, or a handle domain. */
export type RoleGrant = { role: string; source: string }

export type RolesDeps = {
  db: Db
  adminDids: ReadonlySet<string>
}

const parseList = (json: string) => JSON.parse(json) as string[]

const pdsHost = (pdsUrl: string) =>
  URL.canParse(pdsUrl) ? new URL(pdsUrl).hostname.toLowerCase() : undefined

const inDomain = (handle: string, domain: string) =>
  handle === domain || handle.endsWith(`.${domain}`)

/** Which roles a user holds, from the database and the environment. */
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
    return grants
  }

  /** The implicit role plus every role the user holds. */
  async rolesFor(identity: RoleIdentity): Promise<string[]> {
    const grants = await this.grantsFor(identity)
    return [IMPLICIT_ROLE, ...new Set(grants.map((grant) => grant.role))]
  }
}
