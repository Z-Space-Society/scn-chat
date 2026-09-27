import Database from 'better-sqlite3'
import { vi } from 'vitest'
import type {
  ConversationChanges,
  IndexChanges,
  RecordKey,
  StoreApi,
} from '../../src/store/core.ts'
import type { SqlDb } from '../../src/store/sql.ts'

/** The store's SQL interface over better-sqlite3, which speaks the same dialect as SQLite in the browser. */
export function memoryDb(): SqlDb {
  const db = new Database(':memory:')
  return {
    run: (sql, params = []) => void db.prepare(sql).run(...params),
    all: (sql, params = []) => db.prepare(sql).all(...params) as never,
    transaction: (fn) => db.transaction(fn)(),
  }
}

export const text = (value: string) => ({
  $type: 'network.sharedcomputer.chat.defs#plainContent',
  parts: [{ $type: 'network.sharedcomputer.chat.defs#textPart', text: value }],
})

export const message = (rkey: string, value: string, cid = `cid-${rkey}`) => ({
  rkey,
  cid,
  value: {
    $type: 'network.sharedcomputer.chat.message',
    role: 'user',
    content: text(value),
    createdAt: '2026-09-26T00:00:00Z',
  },
})

export const summary = (
  skey: string,
  updatedAt = '2026-09-26T00:00:00Z',
  title: string | null = null,
) => ({
  skey,
  uri: `at://did:plc:alice/space/network.sharedcomputer.chat.conversation/${skey}`,
  title,
  tags: [],
  updatedAt,
  cid: `ref-${skey}-${updatedAt}`,
})

/** A fake server API whose responses tests set directly. */
export function fakeApi() {
  const api = {
    index: { conversations: [], deleted: [], rev: 'r1', full: true } as IndexChanges,
    conversations: new Map<string, ConversationChanges>(),
    keys: new Map<string, RecordKey[]>(),
    fetchIndex: vi.fn(async (_since?: string | null) => api.index),
    fetchConversation: vi.fn(async (skey: string, _since?: string | null) => {
      const changes = api.conversations.get(skey)
      if (!changes) throw new Error(`no fake data for ${skey}`)
      return changes
    }),
    fetchKeys: vi.fn(async (skey?: string) => api.keys.get(skey ?? 'index') ?? []),
  }
  return api as typeof api & StoreApi
}
