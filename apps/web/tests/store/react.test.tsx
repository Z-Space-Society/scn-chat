import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Conversation as Stored } from '../../src/store/core.ts'
import {
  StoreProvider,
  useConversation,
  useRefreshConversation,
  useSyncIndex,
} from '../../src/store/react.tsx'
import { renderAt } from '../helpers/router.tsx'
import { type TestStore, testStore } from '../helpers/store.ts'

/** A promise and the function that settles it, for a store answer the test decides when to give. */
function later<T>() {
  let settle!: (value: T) => void
  let fail!: (err: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  return { promise, settle, fail }
}

const question = {
  rkey: 'u',
  record: { role: 'user', content: { parts: [] }, createdAt: '2026-09-26T00:00:00Z' },
}

/** A store holding one conversation, `s1`, with `messages` on this device and the PDS. */
function storeWith(messages = [question]) {
  const store = testStore()
  store.held('s1', { messages })
  return store
}

let refresh: (skey: string) => Promise<void>
let syncIndex: () => Promise<void>

/** The open conversation as the store tells it, with its intents at hand. */
function Conversation() {
  const { conversation, waiting, empty, error } = useConversation('s1')
  refresh = useRefreshConversation()
  syncIndex = useSyncIndex()
  return (
    <p>
      {waiting ? 'Waiting' : 'Known'} · {empty ? 'Empty' : 'Not empty'} ·{' '}
      {conversation?.messages.length ?? 0} messages{error && ` · ${error}`}
    </p>
  )
}

async function open(store: TestStore) {
  await renderAt(
    <StoreProvider store={store.client}>
      <Conversation />
    </StoreProvider>,
  )
}

const shown = () => screen.getByRole('paragraph').textContent

describe('useConversation', () => {
  it('waits for the local copy, then for the PDS while the copy has no messages, then knows it is empty', async () => {
    const store = testStore()
    const local = later<Stored>()
    const pds = later<void>()
    vi.spyOn(store.client.calls, 'getConversation').mockReturnValueOnce(local.promise)
    vi.spyOn(store.client.calls, 'refreshConversation').mockReturnValueOnce(pds.promise)
    await open(store)
    expect(shown()).toMatch(/^Waiting · Not empty/)
    await act(async () => local.settle({ skey: 's1', info: null, messages: [] }))
    expect(shown()).toMatch(/^Waiting · Not empty/)
    await act(async () => pds.settle())
    await vi.waitFor(() => expect(shown()).toMatch(/^Known · Empty/))
  })

  it('shows messages the local copy has at once, without waiting for the PDS', async () => {
    const store = storeWith()
    store.api.fetchConversation.mockReturnValueOnce(new Promise(() => {}))
    await open(store)
    await vi.waitFor(() => expect(shown()).toBe('Known · Not empty · 1 messages'))
  })

  it('stops waiting on a failed refresh, without calling the conversation empty', async () => {
    const store = testStore()
    store.api.fetchConversation.mockRejectedValueOnce(new Error('PDS unreachable'))
    await open(store)
    await vi.waitFor(() => expect(shown()).toBe('Known · Not empty · 0 messages · PDS unreachable'))
  })

  it('rereads the local copy on a change to the conversation, without checking the PDS again', async () => {
    const store = storeWith()
    await open(store)
    await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalledTimes(1))
    act(() => store.held('s1', { messages: [question, { ...question, rkey: 'v' }] }))
    await vi.waitFor(() => expect(shown()).toBe('Known · Not empty · 2 messages'))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(1)
  })
})

describe('the store intents', () => {
  it('checks an open conversation against the PDS again, fetching changes and then reconciling', async () => {
    const store = storeWith()
    await open(store)
    await vi.waitFor(() => expect(store.api.fetchKeys).toHaveBeenCalledTimes(1))
    // Once the check from opening has finished, as a check asked for while it runs joins it.
    await act(async () => {})
    await act(() => refresh('s1'))
    expect(store.api.fetchConversation).toHaveBeenCalledTimes(2)
    expect(store.api.fetchKeys).toHaveBeenCalledTimes(2)
  })

  it('syncs the chat index', async () => {
    const store = testStore()
    await open(store)
    await act(() => syncIndex())
    expect(store.api.fetchIndex).toHaveBeenCalledTimes(1)
  })
})
