import type { Db } from '../db/index.ts'

export type StorageMode = 'space' | 'local'

export type Account = {
  did: string
  handle: string | null
  pdsUrl: string
  storageMode: StorageMode
  backgroundSync: boolean
  lastActiveAt: string
}

export class SpacesLostError extends Error {
  constructor() {
    super(
      'Your chats are stored in atproto spaces, but your PDS no longer grants space access. Sign in again once your PDS supports spaces.',
    )
    this.name = 'SpacesLostError'
  }
}

type AccountRow = {
  did: string
  handle: string | null
  pds_url: string
  storage_mode: StorageMode
  background_sync: number
  last_active_at: string
}

function toAccount(row: AccountRow): Account {
  return {
    did: row.did,
    handle: row.handle,
    pdsUrl: row.pds_url,
    storageMode: row.storage_mode,
    backgroundSync: row.background_sync === 1,
    lastActiveAt: row.last_active_at,
  }
}

export async function getAccount(db: Db, did: string): Promise<Account | undefined> {
  const row = await db
    .selectFrom('account')
    .select(['did', 'handle', 'pds_url', 'storage_mode', 'background_sync', 'last_active_at'])
    .where('did', '=', did)
    .executeTakeFirst()
  return row ? toAccount(row) : undefined
}

/** Record a login, choosing the storage mode for new accounts and keeping it for existing ones. */
export async function recordLogin(
  db: Db,
  login: { did: string; handle: string | null; pdsUrl: string; spacesAllowed: boolean },
  now = new Date(),
): Promise<Account> {
  const existing = await getAccount(db, login.did)
  if (existing?.storageMode === 'space' && !login.spacesAllowed) throw new SpacesLostError()
  const storageMode: StorageMode =
    existing?.storageMode ?? (login.spacesAllowed ? 'space' : 'local')
  const at = now.toISOString()
  await db
    .insertInto('account')
    .values({
      did: login.did,
      handle: login.handle,
      pds_url: login.pdsUrl,
      storage_mode: storageMode,
      background_sync: 1,
      created_at: at,
      last_login_at: at,
      last_active_at: at,
    })
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        handle: login.handle,
        pds_url: login.pdsUrl,
        last_login_at: at,
        last_active_at: at,
      }),
    )
    .execute()
  const account = await getAccount(db, login.did)
  if (!account) throw new Error(`Account ${login.did} missing right after upsert`)
  return account
}

/** Mark the user active, at most once a minute. */
export async function touchActivity(db: Db, account: Account, now = new Date()): Promise<void> {
  if (now.getTime() - Date.parse(account.lastActiveAt) < 60_000) return
  await db
    .updateTable('account')
    .set({ last_active_at: now.toISOString() })
    .where('did', '=', account.did)
    .execute()
}

export async function setBackgroundSync(db: Db, did: string, enabled: boolean): Promise<void> {
  await db
    .updateTable('account')
    .set({ background_sync: enabled ? 1 : 0 })
    .where('did', '=', did)
    .execute()
}
