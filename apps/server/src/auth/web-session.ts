import { createHash, randomBytes } from 'node:crypto'
import type { Db } from '../db/index.ts'

export const SESSION_COOKIE = 'scn_session'
const DAY_MS = 86_400_000

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createWebSession(
  db: Db,
  did: string,
  ttlDays: number,
  now = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await db
    .insertInto('web_session')
    .values({
      token_hash: hash(token),
      did,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlDays * DAY_MS).toISOString(),
    })
    .execute()
  return token
}

/** Look up the DID for a session token, extending sessions used in the second half of their life. */
export async function resolveWebSession(
  db: Db,
  token: string,
  ttlDays: number,
  now = new Date(),
): Promise<string | null> {
  const row = await db
    .selectFrom('web_session')
    .select(['did', 'expires_at'])
    .where('token_hash', '=', hash(token))
    .executeTakeFirst()
  if (!row) return null
  const expires = Date.parse(row.expires_at)
  if (expires <= now.getTime()) {
    await deleteWebSession(db, token)
    return null
  }
  if (expires - now.getTime() < (ttlDays * DAY_MS) / 2) {
    await db
      .updateTable('web_session')
      .set({ expires_at: new Date(now.getTime() + ttlDays * DAY_MS).toISOString() })
      .where('token_hash', '=', hash(token))
      .execute()
  }
  return row.did
}

export async function deleteWebSession(db: Db, token: string): Promise<void> {
  await db.deleteFrom('web_session').where('token_hash', '=', hash(token)).execute()
}

export async function deleteAllWebSessions(db: Db, did: string): Promise<void> {
  await db.deleteFrom('web_session').where('did', '=', did).execute()
}
