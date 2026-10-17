import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import * as Comlink from 'comlink'
import { type ClientChange, storeCalls } from './calls.ts'
import { StoreCore } from './core.ts'
import { httpApi } from './http-api.ts'
import { STORE_NAME } from './names.ts'
import { ensureSchema } from './schema.ts'
import type { SqlDb } from './sql.ts'

type Sqlite = Awaited<ReturnType<typeof sqlite3InitModule>>
type Pool = Awaited<ReturnType<Sqlite['installOpfsSAHPoolVfs']>>
type Database = InstanceType<Sqlite['oo1']['DB']>

let sqlite: Sqlite | undefined
let pool: Pool | null | undefined
let db: Database | undefined
let core: StoreCore | undefined
let events: EventSource | undefined
const listeners = new Set<(change: ClientChange) => void>()

const emit = (change: ClientChange) => {
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

const calls = storeCalls(() => core, emit)

async function loadSqlite(): Promise<Sqlite> {
  sqlite ??= await sqlite3InitModule()
  return sqlite
}

/** Get the OPFS file pool installed on this SQLite, or null if the browser has no OPFS. */
async function filePool(sqlite3: Sqlite): Promise<Pool | null> {
  if (pool !== undefined) return pool
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
    const files = await filePool(sqlite3)
    if (files?.isPaused()) await files.unpauseVfs()
    db = files ? new files.OpfsSAHPoolDb(await fileFor(did)) : new sqlite3.oo1.DB(':memory:')
    const sql = adapt(db)
    ensureSchema(sql)
    core = new StoreCore({ db: sql, api: httpApi(), did, notify: emit })
    events = new EventSource('/api/events')
    for (const type of ['conversation-changed', 'conversation-deleted', 'index-changed']) {
      events.addEventListener(type, (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { skey?: string }
        void calls
          .handleEvent({ type, skey: data.skey })
          .catch((err: unknown) => console.warn('Live sync failed', type, err))
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
    const files = await filePool(await loadSqlite())
    if (!files) return
    await files.unpauseVfs()
    files.unlink(await fileFor(did))
  },

  subscribe(listener: (change: ClientChange) => void): void {
    listeners.add(listener)
  },

  // Marked as a proxy, so the page calls these methods where they are rather than copying them.
  calls: Comlink.proxy(calls),
}

export type WorkerApi = typeof api

Comlink.expose(api)
