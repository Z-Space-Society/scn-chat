import type { Db } from '../db/index.ts'

export type StorageMode = 'space' | 'local'

export type Account = {
  did: string
  handle: string | null
  pdsUrl: string
  storageMode: StorageMode
  backgroundSync: boolean
  lastActiveAt: string
  /** Signed in only to view shared chats, and never set up for the chat app. */
  viewerOnly: boolean
  suspension: Suspension | null
}

/** Who suspended an account, an admin's DID or plugin:<id>, and why. */
export type Suspension = { at: string; by: string; reason: string | null }

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
  viewer_only: number
  suspended_at: string | null
  suspended_by: string | null
  suspended_reason: string | null
}

function toAccount(row: AccountRow): Account {
  return {
    did: row.did,
    handle: row.handle,
    pdsUrl: row.pds_url,
    storageMode: row.storage_mode,
    backgroundSync: row.background_sync === 1,
    lastActiveAt: row.last_active_at,
    viewerOnly: row.viewer_only === 1,
    suspension: row.suspended_at
      ? { at: row.suspended_at, by: row.suspended_by ?? '', reason: row.suspended_reason }
      : null,
  }
}

export async function getAccount(db: Db, did: string): Promise<Account | undefined> {
  const row = await db
    .selectFrom('account')
    .select([
      'did',
      'handle',
      'pds_url',
      'storage_mode',
      'background_sync',
      'last_active_at',
      'viewer_only',
      'suspended_at',
      'suspended_by',
      'suspended_reason',
    ])
    .where('did', '=', did)
    .executeTakeFirst()
  return row ? toAccount(row) : undefined
}

/**
 * Record a login, choosing the storage mode for new accounts and keeping it for existing ones.
 * A viewer login marks a new account viewer-only, and a full login clears the mark.
 */
export async function recordLogin(
  db: Db,
  login: {
    did: string
    handle: string | null
    pdsUrl: string
    spacesAllowed: boolean
    viewer?: boolean
  },
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
      viewer_only: login.viewer ? 1 : 0,
    })
    .onConflict((oc) =>
      oc.column('did').doUpdateSet({
        handle: login.handle,
        pds_url: login.pdsUrl,
        last_login_at: at,
        last_active_at: at,
        ...(login.viewer ? {} : { viewer_only: 0 }),
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

/** Suspend an account that isn't suspended yet. Returns true if status changed. */
export async function suspendAccount(
  db: Db,
  did: string,
  by: string,
  reason?: string,
): Promise<boolean> {
  const result = await db
    .updateTable('account')
    .set({
      suspended_at: new Date().toISOString(),
      suspended_by: by,
      suspended_reason: reason?.trim() || null,
    })
    .where('did', '=', did)
    .where('suspended_at', 'is', null)
    .executeTakeFirst()
  return result.numUpdatedRows > 0n
}

/** Restore a suspended account. Returns whether it changed. */
export async function restoreAccount(db: Db, did: string): Promise<boolean> {
  const result = await db
    .updateTable('account')
    .set({ suspended_at: null, suspended_by: null, suspended_reason: null })
    .where('did', '=', did)
    .where('suspended_at', 'is not', null)
    .executeTakeFirst()
  return result.numUpdatedRows > 0n
}
