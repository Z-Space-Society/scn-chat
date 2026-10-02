import type { Db } from '../db/index.ts'
import { ADMIN_ROLE } from './roles.ts'

export type RoleMember = { did: string; addedAt: string; addedBy: string }

export type RoleSummary = {
  name: string
  description: string
  builtIn: boolean
  pdsHosts: string[]
  handleDomains: string[]
  members: RoleMember[]
}

export class RoleExists extends Error {
  constructor(name: string) {
    super(`A role named "${name}" already exists`)
    this.name = 'RoleExists'
  }
}

export async function listRoles(db: Db): Promise<RoleSummary[]> {
  const [roles, members] = await Promise.all([
    db.selectFrom('role').selectAll().orderBy('created_at').orderBy('name').execute(),
    db.selectFrom('role_member').selectAll().orderBy('added_at').execute(),
  ])
  return roles.map((role) => ({
    name: role.name,
    description: role.description,
    builtIn: role.name === ADMIN_ROLE,
    pdsHosts: JSON.parse(role.pds_hosts_json) as string[],
    handleDomains: JSON.parse(role.handle_domains_json) as string[],
    members: members
      .filter((member) => member.role === role.name)
      .map((member) => ({ did: member.did, addedAt: member.added_at, addedBy: member.added_by })),
  }))
}

export async function roleExists(db: Db, name: string): Promise<boolean> {
  return Boolean(
    await db.selectFrom('role').select('name').where('name', '=', name).executeTakeFirst(),
  )
}

export async function createRole(db: Db, role: { name: string; description: string }) {
  if (await roleExists(db, role.name)) throw new RoleExists(role.name)
  const now = new Date().toISOString()
  await db
    .insertInto('role')
    .values({
      name: role.name,
      description: role.description,
      pds_hosts_json: '[]',
      handle_domains_json: '[]',
      created_at: now,
      updated_at: now,
    })
    .execute()
}

/** Change a role's description or matching rules. Returns false when there is no such role. */
export async function updateRole(
  db: Db,
  name: string,
  patch: { description?: string; pdsHosts?: string[]; handleDomains?: string[] },
): Promise<boolean> {
  const result = await db
    .updateTable('role')
    .set({
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.pdsHosts ? { pds_hosts_json: JSON.stringify(patch.pdsHosts) } : {}),
      ...(patch.handleDomains ? { handle_domains_json: JSON.stringify(patch.handleDomains) } : {}),
      updated_at: new Date().toISOString(),
    })
    .where('name', '=', name)
    .executeTakeFirst()
  return result.numUpdatedRows > 0n
}

export async function deleteRole(db: Db, name: string): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('role_member').where('role', '=', name).execute()
    await tx.deleteFrom('role').where('name', '=', name).execute()
  })
}

export async function addMember(db: Db, role: string, did: string, addedBy: string) {
  await db
    .insertInto('role_member')
    .values({ role, did, added_at: new Date().toISOString(), added_by: addedBy })
    .onConflict((oc) => oc.columns(['role', 'did']).doNothing())
    .execute()
}

/** Returns false when the DID was not an explicit member. */
export async function removeMember(db: Db, role: string, did: string): Promise<boolean> {
  const result = await db
    .deleteFrom('role_member')
    .where('role', '=', role)
    .where('did', '=', did)
    .executeTakeFirst()
  return result.numDeletedRows > 0n
}
