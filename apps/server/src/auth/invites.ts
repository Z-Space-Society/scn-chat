import type { Db } from '../db/index.ts'

/** People an admin added can create an account in any registration mode. */
export type Invite = { did: string; addedBy: string; addedAt: string }

export async function addInvite(db: Db, did: string, addedBy: string): Promise<void> {
  await db
    .insertInto('account_invite')
    .values({ did, added_by: addedBy, added_at: new Date().toISOString() })
    .onConflict((oc) => oc.column('did').doNothing())
    .execute()
}

export async function isInvited(db: Db, did: string): Promise<boolean> {
  return Boolean(
    await db.selectFrom('account_invite').select('did').where('did', '=', did).executeTakeFirst(),
  )
}

export async function listInvites(db: Db): Promise<Invite[]> {
  const rows = await db.selectFrom('account_invite').selectAll().orderBy('added_at').execute()
  return rows.map((row) => ({ did: row.did, addedBy: row.added_by, addedAt: row.added_at }))
}

/** Returns false when the DID wasn't added. */
export async function removeInvite(db: Db, did: string): Promise<boolean> {
  const result = await db.deleteFrom('account_invite').where('did', '=', did).executeTakeFirst()
  return result.numDeletedRows > 0n
}
