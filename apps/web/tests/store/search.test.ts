import { describe, expect, it } from 'vitest'
import { StoreCore } from '../../src/store/core.ts'
import { ensureSchema } from '../../src/store/schema.ts'
import { ftsQuery, MATCH_END, MATCH_START } from '../../src/store/search.ts'
import { fakeApi, memoryDb, message, summary } from './helpers.ts'

function setup() {
  const db = memoryDb()
  ensureSchema(db)
  const store = new StoreCore({ db, api: fakeApi(), did: 'did:plc:alice' })
  return { db, store }
}

const reply = (rkey: string, value: string) => {
  const m = message(rkey, value)
  return { ...m, value: { ...m.value, role: 'assistant', parent: 'u1' } }
}

const changes = (messages: ReturnType<typeof message>[], full = false) => ({
  info: null,
  messages,
  deleted: [],
  rev: 'r1',
  full,
})

/** A store with one conversation holding the given messages. */
function withConversation(messages: ReturnType<typeof message>[], title: string | null = null) {
  const { db, store } = setup()
  store.applyIndex({
    conversations: [summary('a', undefined, title)],
    deleted: [],
    rev: 'r1',
    full: true,
  })
  store.applyConversation('a', changes(messages))
  return { db, store }
}

const found = (store: StoreCore, query: string) =>
  store.search(query).map((r) => `${r.skey}/${r.rkey ?? 'title'}`)

describe('ftsQuery', () => {
  it('quotes each word so they are ANDed, matching the last as a prefix', () => {
    expect(ftsQuery('tile grou')).toBe('"tile" "grou"*')
  })

  it('matches the last word exactly once a space follows it', () => {
    expect(ftsQuery('tile grout ')).toBe('"tile" "grout"')
  })

  it('keeps a closed quoted phrase together and exact', () => {
    expect(ftsQuery('grout "blue tile"')).toBe('"grout" "blue tile"')
  })

  it('treats an unclosed quote as a phrase to the end, still being typed', () => {
    expect(ftsQuery('grout "blue ti')).toBe('"grout" "blue ti"*')
  })

  it('does not prefix an earlier word when the last is not searchable', () => {
    expect(ftsQuery('grout *')).toBe('"grout"')
  })

  it('escapes quotes inside a word', () => {
    expect(ftsQuery('don"t ')).toBe('"don""t"')
  })

  it('returns null when nothing searchable is left', () => {
    expect(ftsQuery('  * " ( ')).toBeNull()
  })
})

describe('StoreCore.search', () => {
  it('finds a user message by a word in it', () => {
    const { store } = withConversation([message('u1', 'How do I regrout bathroom tiles?')])
    expect(found(store, 'bathroom')).toEqual(['a/u1'])
  })

  it('finds an assistant reply by a word in it', () => {
    const { store } = withConversation([message('u1', 'Hi'), reply('u1.r0', 'Use epoxy grout.')])
    expect(store.search('epoxy')).toMatchObject([{ rkey: 'u1.r0', role: 'assistant' }])
  })

  it('ranks a title match above message matches', () => {
    const { store } = withConversation([message('u1', 'grout grout grout')], 'Grout plans')
    expect(found(store, 'grout')).toEqual(['a/title', 'a/u1'])
  })

  it('finds a word from its first few letters while it is typed', () => {
    const { store } = withConversation([message('u1', 'Regrouting the bathroom')])
    expect(found(store, 'bathr')).toEqual(['a/u1'])
  })

  it('matches only messages containing every word', () => {
    const { store } = withConversation([message('u1', 'blue tile'), message('u2', 'blue paint')])
    expect(found(store, 'blue tile ')).toEqual(['a/u1'])
  })

  it('matches a quoted phrase only in that order', () => {
    const { store } = withConversation([message('u1', 'blue tile'), message('u2', 'tile is blue')])
    expect(found(store, '"blue tile"')).toEqual(['a/u1'])
  })

  it('treats query syntax characters as plain text', () => {
    const { store } = withConversation([message('u1', 'blue tile')])
    for (const query of ['blue OR', 'NEAR(', 'tile*', '"', 'col:blue', '^blue -tile', 'AND'])
      expect(() => store.search(query)).not.toThrow()
  })

  it('ignores diacritics', () => {
    const { store } = withConversation([message('u1', 'Un café crème')])
    expect(found(store, 'cafe creme')).toEqual(['a/u1'])
  })

  it('finds an edited message by its new text only', () => {
    const { store } = withConversation([message('u1', 'blue tile')])
    store.applyConversation('a', changes([message('u1', 'green tile', 'cid-2')]))
    expect([found(store, 'green'), found(store, 'blue')]).toEqual([['a/u1'], []])
  })

  it('drops a deleted message from results', () => {
    const { store } = withConversation([message('u1', 'blue tile')])
    store.applyConversation('a', {
      ...changes([]),
      deleted: [{ collection: 'network.sharedcomputer.chat.message', rkey: 'u1' }],
    })
    expect(found(store, 'blue')).toEqual([])
  })

  it('drops a deleted conversation and its messages from results', () => {
    const { store } = withConversation([message('u1', 'blue tile')], 'Blue')
    store.removeConversation('a')
    expect(found(store, 'blue')).toEqual([])
  })

  it('follows a renamed conversation', () => {
    const { store } = withConversation([], 'Old name')
    store.applyIndex({
      conversations: [summary('a', undefined, 'New name')],
      deleted: [],
      rev: 'r2',
      full: false,
    })
    expect([found(store, 'new'), found(store, 'old')]).toEqual([['a/title'], []])
  })

  it('keeps the index right through a full refetch', () => {
    const { store } = withConversation([message('u1', 'blue tile')])
    store.applyConversation('a', changes([message('u1', 'blue tile')], true))
    expect(found(store, 'blue')).toEqual(['a/u1'])
  })

  it('marks matched words in the snippet', () => {
    const { store } = withConversation([message('u1', 'blue tile')])
    expect(store.search('tile')[0]?.snippet).toBe(`blue ${MATCH_START}tile${MATCH_END}`)
  })

  it('never finds encrypted messages', () => {
    const encrypted = message('u1', '')
    encrypted.value.content = {
      $type: 'network.sharedcomputer.chat.defs#encryptedContent',
    } as never
    const { db, store } = withConversation([encrypted])
    expect(db.all('select text from message_fts')).toEqual([{ text: '' }])
    expect(store.search('encrypted')).toEqual([])
  })

  it('pages through results', () => {
    const { store } = withConversation([message('u1', 'tile'), message('u2', 'tile tile')])
    expect([
      store.search('tile', { limit: 1 }).length,
      store.search('tile', { offset: 1 }).length,
    ]).toEqual([1, 1])
  })
})

describe('StoreCore.remainingDownloads', () => {
  it('counts conversations not yet fetched', () => {
    const { store } = setup()
    store.applyIndex({
      conversations: [summary('a'), summary('b')],
      deleted: [],
      rev: 'r1',
      full: true,
    })
    store.applyConversation('a', changes([]))
    expect(store.remainingDownloads()).toBe(1)
  })
})
