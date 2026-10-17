import * as Comlink from 'comlink'
import type { ClientChange, StoreCalls } from './calls.ts'
import { createHandover, type HandoverState } from './handover.ts'
import { STORE_NAME } from './names.ts'
import type { WorkerApi } from './worker.ts'

/**
 * The user's store, as a tab holds it: its calls, which fail with StoreClosed while another tab
 * holds it, and whether this tab does.
 */
export type StoreClient = {
  calls: StoreCalls
  state: () => HandoverState
  onState: (listener: (state: HandoverState) => void) => () => void
  onChange: (listener: (change: ClientChange) => void) => () => void
  claim: () => Promise<HandoverState>
  deleteLocalCopy: () => Promise<void>
}

const stores = new Map<string, StoreClient>()

/** Get the DB store for an account, starting it on first use. */
export function openStore(did: string): StoreClient {
  let store = stores.get(did)
  if (!store) {
    store = startStore(did)
    stores.set(did, store)
  }
  return store
}

/** Start the store worker for an account and move the store to this tab whenever it gains focus. */
function startStore(did: string): StoreClient {
  const worker = Comlink.wrap<WorkerApi>(
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  )
  const stateListeners = new Set<(state: HandoverState) => void>()
  const changeListeners = new Set<(change: ClientChange) => void>()
  let firstOpen = true

  void worker.subscribe(
    Comlink.proxy((change: ClientChange) => {
      for (const listener of changeListeners) listener(change)
    }),
  )

  const handover = createHandover({
    name: `${STORE_NAME}-store-${did}`,
    locks: navigator.locks as never,
    channel: new BroadcastChannel(`${STORE_NAME}-store-${did}`) as never,
    open: async () => {
      await worker.open(did)
      if (firstOpen) {
        firstOpen = false
        void worker.calls
          .syncIndex()
          .then(() => worker.calls.reconcileIndex())
          .then(() => worker.calls.backgroundDownload())
          .catch((err) => console.warn('Store sync failed', err))
      } else {
        void worker.calls.syncIndex().catch((err) => console.warn('Store sync failed', err))
      }
    },
    pause: () => worker.pause(),
    onState: (state) => {
      for (const listener of stateListeners) listener(state)
    },
  })

  window.addEventListener('focus', () => void handover.claim())
  void handover.claim()

  return {
    calls: worker.calls,
    state: () => handover.state,
    onState: (listener) => {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    onChange: (listener) => {
      changeListeners.add(listener)
      return () => changeListeners.delete(listener)
    },
    claim: () => handover.claim(),
    /** Move the store to this tab first, since only the tab holding it can delete its file. */
    deleteLocalCopy: async () => {
      const state = await handover.claim()
      if (state === 'failed')
        throw new Error("This device's copy of your chats couldn't be opened.")
      if (state !== 'active')
        throw new Error('Another tab is using this device copy. Close it and try again.')
      await worker.deleteDatabase(did)
    },
  }
}
