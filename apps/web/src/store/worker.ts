import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import * as Comlink from 'comlink'
import { type StoreChange, StoreCore } from './core.ts'
import { StoreClosed } from './errors.ts'
import { httpApi, Unauthorized } from './http-api.ts'
import { STORE_NAME } from './names.ts'
import { ensureSchema } from './schema.ts'
import type { SqlDb } from './sql.ts'

export type WorkerChange = StoreChange | { type: 'unauthorized' }

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>
type Pool = Awaited<ReturnType<Sqlite['installOpfsSAHPoolVfs']>>
type Database = InstanceType<Sqlite['oo1']['DB']>

let sqlite: Sqlite | undefined
let pool: Pool | null | undefined
let db: Database | undefined
let core: StoreCore | undefined
let events: EventSource | undefined
const listeners = new Set<(change: WorkerChange) => void>()

const emit = (change: WorkerChange) => {
  for (const listener of listeners) listener(change)
}

async function fileFor(did: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(did))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `/${STORE_NAME}-${hex.slice(0, 16)}.sqlite3`
}

function adapt(database: Database): SqlDb {
  return {
    run: (sql, params = []) => void database.exec({ sql, bind: params }),
    all: (sql, params = []) => database.selectObjects(sql, params) as never,
    transaction: (fn) => void database.transaction(() => fn()),
  }
}

/** Run a store call, turning an ended session into an event the page can act on. */
async function guard<T>(fn: (store: StoreCore) => Promise<T> | T): Promise<T> {
  if (!core) throw new StoreClosed()
  try {
    return await fn(core)
  } catch (err) {
    if (err instanceof Unauthorized) emit({ type: 'unauthorized' })
    throw err
  }
}

async function loadSqlite(): Promise<Sqlite> {
  sqlite ??= await sqlite3InitModule()
  return sqlite
}

/** Get the OPFS file pool, or null if the browser has no OPFS. */
async function filePool(): Promise<Pool | null> {
  if (pool !== undefined) return pool
  const sqlite3 = await loadSqlite()
  const handles = globalThis.FileSystemFileHandle?.prototype
  if (!handles || !('createSyncAccessHandle' in handles) || !navigator.storage?.getDirectory) {
    console.warn('This browser has no origin private file system, keeping chats in memory')
    pool = null
    return pool
  }
  // This fails while another tab holds the files. The reinit option, missing from the
  // published types, lets the handover's retry try again.
  const options = { name: STORE_NAME, forceReinitIfPreviouslyFailed: true }
  pool = await sqlite3.installOpfsSAHPoolVfs(options)
  return pool
}

const api = {
  /** Open this account's database, persisting it in the origin private file system when possible. */
  async open(did: string): Promise<void> {
    const sqlite3 = await loadSqlite()
    const files = await filePool()
    if (files?.isPaused()) await files.unpauseVfs()
    db = files ? new files.OpfsSAHPoolDb(await fileFor(did)) : new sqlite3.oo1.DB(':memory:')
    const sql = adapt(db)
    ensureSchema(sql)
    core = new StoreCore({ db: sql, api: httpApi(), did, notify: emit })
    events = new EventSource('/api/events')
    for (const type of ['conversation-changed', 'conversation-deleted', 'index-changed']) {
      events.addEventListener(type, (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { skey?: string }
        void guard((store) => store.handleEvent({ type, skey: data.skey })).catch((err: unknown) =>
          console.warn('Live sync failed', type, err),
        )
      })
    }
  },

  /** Close the database so another tab can open it. */
  pause(): void {
    events?.close()
    events = undefined
    db?.close()
    db = undefined
    core = undefined
    if (pool && !pool.isPaused()) pool.pauseVfs()
  },

  /** Delete this account's database, on sign-out or an ended session. */
  async deleteDatabase(did: string): Promise<void> {
    api.pause()
    const files = await filePool()
    if (!files) return
    await files.unpauseVfs()
    files.unlink(await fileFor(did))
  },

  subscribe(listener: (change: WorkerChange) => void): void {
    listeners.add(listener)
  },

  listConversations: () => guard((store) => store.listConversations()),
  getConversation: (skey: string) => guard((store) => store.getConversation(skey)),
  syncIndex: () => guard((store) => store.syncIndex()),
  refreshConversation: (skey: string) => guard((store) => store.refreshConversation(skey)),
  reconcileIndex: () => guard((store) => store.reconcileIndex()),
  reconcileConversation: (skey: string) => guard((store) => store.reconcileConversation(skey)),
  backgroundDownload: () => guard((store) => store.backgroundDownload()),
}

export type WorkerApi = typeof api

Comlink.expose(api)
