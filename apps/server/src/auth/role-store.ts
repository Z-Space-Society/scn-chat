import { isValidDid } from '@atproto/syntax'
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

/** Refuse a plugin's change to `admin`, to a role that doesn't exist, or with an entry that isn't a DID. */
async function checkPluginChange(db: Db, role: string, dids: string[]) {
  if (role === ADMIN_ROLE) throw new Error(`Plugins can't change the "${ADMIN_ROLE}" role`)
  const invalid = dids.find((did) => !isValidDid(did))
  if (invalid !== undefined) throw new Error(`"${invalid}" is not a valid DID`)
  if (!(await roleExists(db, role))) throw new Error(`There is no role named "${role}"`)
}

/** Batches that stay under the databases' limits on bound parameters. */
const batches = <T>(list: T[], size = 500) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  )

/**
 * Bring a role in line with an outside list, on behalf of `by`, such as plugin:<id>. Drops
 * members who aren't listed and adds listed DIDs that have an account.
 */
export async function syncMembers(
  db: Db,
  role: string,
  dids: string[],
  by: string,
): Promise<{ added: number; removed: number }> {
  await checkPluginChange(db, role, dids)
  const listed = new Set(dids)
  return db.transaction().execute(async (tx) => {
    const current = new Set(
      (await tx.selectFrom('role_member').select('did').where('role', '=', role).execute()).map(
        (row) => row.did,
      ),
    )
    const stale = [...current].filter((did) => !listed.has(did))
    const fresh: string[] = []
    for (const batch of batches([...listed].filter((did) => !current.has(did)))) {
      const accounts = await tx
        .selectFrom('account')
        .select('did')
        .where('did', 'in', batch)
        .execute()
      fresh.push(...accounts.map((row) => row.did))
    }
    for (const batch of batches(stale))
      await tx
        .deleteFrom('role_member')
        .where('role', '=', role)
        .where('did', 'in', batch)
        .execute()
    const now = new Date().toISOString()
    for (const batch of batches(fresh))
      await tx
        .insertInto('role_member')
        .values(batch.map((did) => ({ role, did, added_at: now, added_by: by })))
        .execute()
    return { added: fresh.length, removed: stale.length }
  })
}

/** Add one member on a plugin's behalf, whether or not they have an account yet. */
export async function addPluginMember(db: Db, role: string, did: string, by: string) {
  await checkPluginChange(db, role, [did])
  await addMember(db, role, did, by)
}
