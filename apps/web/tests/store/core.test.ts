import { describe, expect, it, vi } from 'vitest'
import { StoreCore } from '../../src/store/core.ts'
import { ensureSchema, SCHEMA_VERSION } from '../../src/store/schema.ts'
import { fakeApi, memoryDb, message, summary } from './helpers.ts'

function setup() {
  const db = memoryDb()
  ensureSchema(db)
  const api = fakeApi()
  const notify = vi.fn()
  const store = new StoreCore({ db, api, did: 'did:plc:alice', notify })
  return { db, api, store, notify }
}

describe('ensureSchema', () => {
  it('rebuilds the database when the schema version changes', () => {
    const db = memoryDb()
    ensureSchema(db)
    db.run("insert into conversation (skey, uri, updated_at) values ('a', 'u', 't')")
    db.run("update meta set value = '0' where key = 'schema_version'")
    ensureSchema(db)
    expect(db.all('select * from conversation')).toEqual([])
    expect(db.all("select value from meta where key = 'schema_version'")).toEqual([
      { value: String(SCHEMA_VERSION) },
    ])
  })

  it('keeps data when the version matches', () => {
    const db = memoryDb()
    ensureSchema(db)
    db.run("insert into conversation (skey, uri, updated_at) values ('a', 'u', 't')")
    ensureSchema(db)
    expect(db.all('select skey from conversation')).toEqual([{ skey: 'a' }])
  })
})

describe('StoreCore index sync', () => {
  it('fetches the whole index the first time and stores its revision', async () => {
    const { api, store } = setup()
    api.index = {
      conversations: [summary('a', '2026-09-26T01:00:00Z'), summary('b', '2026-09-26T02:00:00Z')],
      deleted: [],
      rev: 'r5',
      full: true,
    }
    await store.syncIndex()
    expect(api.fetchIndex).toHaveBeenCalledWith(null)
    expect(store.listConversations().map((c) => c.skey)).toEqual(['b', 'a'])
  })

  it('then fetches only changes since the stored revision, including deletions', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a'), summary('b')], deleted: [], rev: 'r5', full: true }
    await store.syncIndex()
    api.index = { conversations: [summary('c')], deleted: ['a'], rev: 'r6', full: false }
    await store.syncIndex()
    expect(api.fetchIndex).toHaveBeenLastCalledWith('r5')
    expect(
      store
        .listConversations()
        .map((c) => c.skey)
        .sort(),
    ).toEqual(['b', 'c'])
  })

  it('drops conversations missing from a full index, with their messages', async () => {
    const { api, store, db } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'hi')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.refreshConversation('a')
    api.index = { conversations: [], deleted: [], rev: 'r2', full: true }
    await store.syncIndex()
    expect(db.all('select * from message')).toEqual([])
  })
})

describe('StoreCore conversations', () => {
  it('fetches a conversation in full the first time, then only its changes', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: { value: { title: 'T' }, cid: 'i1' },
      messages: [message('m1', 'one')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.refreshConversation('a')
    expect(api.fetchConversation).toHaveBeenLastCalledWith('a', null)
    api.conversations.set('a', {
      info: null,
      messages: [message('m2', 'two')],
      deleted: [{ collection: 'network.sharedcomputer.chat.message', rkey: 'm1' }],
      rev: 'c2',
      full: false,
    })
    await store.refreshConversation('a')
    expect(api.fetchConversation).toHaveBeenLastCalledWith('a', 'c1')
    const conversation = store.getConversation('a')
    expect(conversation.info).toEqual({ title: 'T' })
    expect(conversation.messages.map((m) => m.rkey)).toEqual(['m2'])
  })

  it('stores message text for search and announces changes', async () => {
    const { api, store, db, notify } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'tile quotes')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.refreshConversation('a')
    expect(db.all('select text from message')).toEqual([{ text: 'tile quotes' }])
    expect(notify).toHaveBeenCalledWith({ type: 'conversation', skey: 'a' })
  })
})

describe('StoreCore background download', () => {
  it('fetches every unfetched conversation, newest first, at most two at a time', async () => {
    const { api, store } = setup()
    api.index = {
      conversations: [
        summary('old', '2026-09-01T00:00:00Z'),
        summary('mid', '2026-09-10T00:00:00Z'),
        summary('new', '2026-09-20T00:00:00Z'),
      ],
      deleted: [],
      rev: 'r1',
      full: true,
    }
    await store.syncIndex()
    let running = 0
    let peak = 0
    const order: string[] = []
    api.fetchConversation.mockImplementation(async (skey: string) => {
      running++
      peak = Math.max(peak, running)
      order.push(skey)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
      return { info: null, messages: [], deleted: [], rev: 'c', full: true }
    })
    await store.backgroundDownload()
    expect(order).toEqual(['new', 'mid', 'old'])
    expect(peak).toBe(2)
    expect(store.staleConversations()).toEqual([])
  })

  it('keeps downloading past a conversation that fails, and leaves it stale for next time', async () => {
    const { api, store } = setup()
    api.index = {
      conversations: [
        summary('bad', '2026-09-20T00:00:00Z'),
        summary('good', '2026-09-10T00:00:00Z'),
      ],
      deleted: [],
      rev: 'r1',
      full: true,
    }
    await store.syncIndex()
    api.conversations.set('good', { info: null, messages: [], deleted: [], rev: 'c', full: true })
    await store.backgroundDownload(1)
    expect(store.staleConversations()).toEqual(['bad'])
  })

  it('refetches a conversation whose index entry is newer than its last fetch', async () => {
    const { api, store } = setup()
    const clock = { now: '2026-09-26T00:00:00Z' }
    const s = new StoreCore({
      db: (store as unknown as { db: never }).db,
      api,
      did: 'did:plc:alice',
      now: () => clock.now,
    })
    api.index = {
      conversations: [summary('a', '2026-09-25T00:00:00Z')],
      deleted: [],
      rev: 'r1',
      full: true,
    }
    await s.syncIndex()
    api.conversations.set('a', { info: null, messages: [], deleted: [], rev: 'c1', full: true })
    await s.backgroundDownload()
    expect(s.staleConversations()).toEqual([])
    api.index = {
      conversations: [summary('a', '2026-09-27T00:00:00Z')],
      deleted: [],
      rev: 'r2',
      full: false,
    }
    await s.syncIndex()
    expect(s.staleConversations()).toEqual(['a'])
  })
})

describe('StoreCore reconciling', () => {
  it('refetches a conversation whose keys or CIDs differ, and deletes what the PDS no longer has', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'one'), message('gone', 'x')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.refreshConversation('a')
    api.keys.set('a', [
      { collection: 'network.sharedcomputer.chat.message', rkey: 'm1', cid: 'cid-m1-changed' },
    ])
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'one edited', 'cid-m1-changed')],
      deleted: [],
      rev: 'c2',
      full: true,
    })
    await store.reconcileConversation('a')
    expect(store.getConversation('a').messages.map((m) => m.rkey)).toEqual(['m1'])
    expect(store.getConversation('a').messages[0]?.cid).toBe('cid-m1-changed')
  })

  it('does nothing when every key and CID matches', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'one')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.refreshConversation('a')
    api.keys.set('a', [
      { collection: 'network.sharedcomputer.chat.message', rkey: 'm1', cid: 'cid-m1' },
    ])
    api.fetchConversation.mockClear()
    await store.reconcileConversation('a')
    expect(api.fetchConversation).not.toHaveBeenCalled()
  })

  it('refetches the index when its entries differ', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.keys.set('index', [
      { collection: 'network.sharedcomputer.chat.conversationRef', rkey: 'b', cid: 'x' },
    ])
    api.index = { conversations: [summary('b')], deleted: [], rev: 'r9', full: true }
    await store.reconcileIndex()
    expect(store.listConversations().map((c) => c.skey)).toEqual(['b'])
  })
})

describe('StoreCore events', () => {
  it('fetches a changed conversation, syncs the index, and removes a deleted conversation', async () => {
    const { api, store } = setup()
    api.index = { conversations: [summary('a')], deleted: [], rev: 'r1', full: true }
    await store.syncIndex()
    api.conversations.set('a', {
      info: null,
      messages: [message('m1', 'hi')],
      deleted: [],
      rev: 'c1',
      full: true,
    })
    await store.handleEvent({ type: 'conversation-changed', skey: 'a' })
    expect(store.getConversation('a').messages).toHaveLength(1)
    await store.handleEvent({ type: 'index-changed' })
    expect(api.fetchIndex).toHaveBeenCalledTimes(2)
    await store.handleEvent({ type: 'conversation-deleted', skey: 'a' })
    expect(store.listConversations()).toEqual([])
  })

  it('throws on a conversation event without a conversation key', async () => {
    const { store } = setup()
    await expect(store.handleEvent({ type: 'conversation-changed' })).rejects.toThrow(
      /without a conversation/,
    )
  })
})
