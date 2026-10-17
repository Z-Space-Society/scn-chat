import { nsid } from '@scn-chat/lexicons/nsid'
import { vi } from 'vitest'
import { type ClientChange, storeCalls } from '../../src/store/calls.ts'
import type { StoreClient } from '../../src/store/client.ts'
import { type ConversationChanges, StoreCore } from '../../src/store/core.ts'
import type { HandoverState } from '../../src/store/handover.ts'
import { ensureSchema } from '../../src/store/schema.ts'
import { fakeApi, memoryDb } from '../store/helpers.ts'

type Json = Record<string, unknown>

/** A message record as the PDS holds it. */
export type HeldMessage = { rkey: string; record: Json; cid?: string }

/** A conversation's records as the PDS holds them. */
export type HeldConversation = { info?: Json | null; messages: HeldMessage[] }

/** A chat in the user's chat index. */
export type HeldChat = { skey: string; title?: string | null; tags?: string[]; updatedAt?: string }

const changesOf = (held: HeldConversation): ConversationChanges => ({
  info: held.info ? { value: held.info, cid: `cid-${JSON.stringify(held.info)}` } : null,
  messages: held.messages.map((message) => ({
    rkey: message.rkey,
    value: message.record,
    cid: message.cid ?? `cid-${message.rkey}-${JSON.stringify(message.record)}`,
  })),
  deleted: [],
  rev: 'r1',
  full: true,
})

/**
 * The user's store running in the test, over better-sqlite3 rather than SQLite in a worker, with
 * the server's answers set by the test. Its calls, syncs, and change events are the real ones, so a
 * test reaches the store only through what the PDS holds and what a tab can call.
 */
export function testStore(options: { did?: string; state?: HandoverState } = {}) {
  const did = options.did ?? 'did:plc:alice'
  const db = memoryDb()
  ensureSchema(db)
  const api = fakeApi()
  // A conversation the test gave no records for has none on the PDS.
  api.fetchConversation.mockImplementation(
    async (skey: string) => api.conversations.get(skey) ?? changesOf({ messages: [] }),
  )
  const changes = new Set<(change: ClientChange) => void>()
  const states = new Set<(state: HandoverState) => void>()
  let state = options.state ?? 'active'
  const emit = (change: ClientChange) => {
    for (const listener of changes) listener(change)
  }
  const core = new StoreCore({ db, api, did, notify: emit })
  const setState = (next: HandoverState) => {
    state = next
    for (const listener of states) listener(state)
  }

  const client: StoreClient = {
    calls: storeCalls(() => (state === 'active' ? core : undefined), emit),
    state: () => state,
    onState: (listener) => {
      states.add(listener)
      return () => states.delete(listener)
    },
    onChange: (listener) => {
      changes.add(listener)
      return () => changes.delete(listener)
    },
    claim: vi.fn(async () => {
      setState('active')
      return state
    }),
    deleteLocalCopy: vi.fn(async () => {}),
  }

  /** Put a conversation's records on the PDS, for the store to fetch when it next refreshes. */
  const remote = (skey: string, held: HeldConversation) => {
    const conversation = changesOf(held)
    api.conversations.set(skey, conversation)
    api.keys.set(skey, [
      ...(conversation.info
        ? [{ collection: nsid.info, rkey: 'self', cid: conversation.info.cid }]
        : []),
      ...conversation.messages.map((m) => ({ collection: nsid.message, rkey: m.rkey, cid: m.cid })),
    ])
  }

  return {
    client,
    /** The server's answers, which tests set and spy on. */
    api,
    /** Report a change as the store would, such as the session ending. */
    emit,
    /** Move the store to another tab, or back to this one. */
    setState,
    remote,
    /** Put a conversation's records on the PDS and on this device, as a sync that just ran. */
    held(skey: string, held: HeldConversation) {
      remote(skey, held)
      core.applyConversation(skey, changesOf(held))
    },
    /** Put chats in the user's chat index on the PDS, and sync the index to this device. */
    async chats(chats: HeldChat[]) {
      const conversations = chats.map((chat) => {
        const updatedAt = chat.updatedAt ?? '2026-09-26T00:00:00Z'
        return {
          skey: chat.skey,
          uri: `at://${did}/space/${nsid.conversation}/${chat.skey}`,
          title: chat.title ?? null,
          tags: chat.tags ?? [],
          updatedAt,
          cid: `ref-${chat.skey}-${updatedAt}`,
        }
      })
      api.index = { conversations, deleted: [], rev: 'r1', full: true }
      api.keys.set(
        'index',
        conversations.map((c) => ({ collection: nsid.conversationRef, rkey: c.skey, cid: c.cid })),
      )
      await core.syncIndex()
    },
  }
}

export type TestStore = ReturnType<typeof testStore>
