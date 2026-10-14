import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoreClient } from '../../src/store/client.ts'
import {
  StoreProvider,
  useConversation,
  useRefreshConversation,
  useSyncIndex,
} from '../../src/store/react.tsx'
import { renderAt } from '../helpers/router.tsx'

type Change = { type: string; skey?: string }

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

/** A browser store whose answers the test gives, holding one conversation, `s1`. */
function fakeStore(messages: { rkey: string }[] = []) {
  const changes = new Set<(change: Change) => void>()
  return {
    worker: {
      getConversation: vi.fn(async (skey: string) => ({ skey, info: null, messages })),
      refreshConversation: vi.fn(async () => {}),
      reconcileConversation: vi.fn(async () => {}),
      syncIndex: vi.fn(async () => {}),
    },
    state: () => 'active',
    onState: () => () => {},
    onChange: (listener: (change: Change) => void) => {
      changes.add(listener)
      return () => changes.delete(listener)
    },
    change(change: Change) {
      for (const listener of changes) listener(change)
    },
  }
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

async function open(store: ReturnType<typeof fakeStore>) {
  await renderAt(
    <StoreProvider store={store as unknown as StoreClient}>
      <Conversation />
    </StoreProvider>,
  )
}

const shown = () => screen.getByRole('paragraph').textContent

describe('useConversation', () => {
  it('waits for the local copy, then for the PDS while the copy has no messages, then knows it is empty', async () => {
    const store = fakeStore()
    const local = later<{ skey: string; info: null; messages: never[] }>()
    const pds = later<void>()
    store.worker.getConversation.mockReturnValueOnce(local.promise)
    store.worker.refreshConversation.mockReturnValueOnce(pds.promise)
    await open(store)
    expect(shown()).toMatch(/^Waiting · Not empty/)
    await act(async () => local.settle({ skey: 's1', info: null, messages: [] }))
    expect(shown()).toMatch(/^Waiting · Not empty/)
    await act(async () => pds.settle())
    await vi.waitFor(() => expect(shown()).toMatch(/^Known · Empty/))
  })

  it('shows messages the local copy has at once, without waiting for the PDS', async () => {
    const store = fakeStore([{ rkey: 'u' }])
    store.worker.refreshConversation.mockReturnValueOnce(new Promise(() => {}))
    await open(store)
    await vi.waitFor(() => expect(shown()).toBe('Known · Not empty · 1 messages'))
  })

  it('stops waiting on a failed refresh, without calling the conversation empty', async () => {
    const store = fakeStore()
    store.worker.refreshConversation.mockRejectedValueOnce(new Error('PDS unreachable'))
    await open(store)
    await vi.waitFor(() => expect(shown()).toBe('Known · Not empty · 0 messages · PDS unreachable'))
  })

  it('rereads the local copy on a change to the conversation, without checking the PDS again', async () => {
    const store = fakeStore([{ rkey: 'u' }])
    await open(store)
    await vi.waitFor(() => expect(store.worker.reconcileConversation).toHaveBeenCalledTimes(1))
    act(() => store.change({ type: 'conversation', skey: 's1' }))
    await vi.waitFor(() => expect(store.worker.getConversation).toHaveBeenCalledTimes(2))
    expect(store.worker.refreshConversation).toHaveBeenCalledTimes(1)
  })
})

describe('the store intents', () => {
  it('checks an open conversation against the PDS again, fetching changes and then reconciling', async () => {
    const store = fakeStore([{ rkey: 'u' }])
    await open(store)
    await vi.waitFor(() => expect(store.worker.reconcileConversation).toHaveBeenCalledTimes(1))
    // Once the check from opening has finished, as a check asked for while it runs joins it.
    await act(async () => {})
    await act(() => refresh('s1'))
    expect(store.worker.refreshConversation).toHaveBeenCalledTimes(2)
    expect(store.worker.reconcileConversation).toHaveBeenCalledTimes(2)
  })

  it('syncs the chat index', async () => {
    const store = fakeStore()
    await open(store)
    await act(() => syncIndex())
    expect(store.worker.syncIndex).toHaveBeenCalledTimes(1)
  })
})
