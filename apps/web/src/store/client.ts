import * as Comlink from 'comlink'
import { createHandover, type HandoverState } from './handover.ts'
import type { WorkerApi, WorkerChange } from './worker.ts'

export type StoreClient = {
  worker: Comlink.Remote<WorkerApi>
  state: () => HandoverState
  onState: (listener: (state: HandoverState) => void) => () => void
  onChange: (listener: (change: WorkerChange) => void) => () => void
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
  const changeListeners = new Set<(change: WorkerChange) => void>()
  let firstOpen = true

  void worker.subscribe(
    Comlink.proxy((change: WorkerChange) => {
      for (const listener of changeListeners) listener(change)
    }),
  )

  const handover = createHandover({
    name: `scn-chat-store-${did}`,
    locks: navigator.locks as never,
    channel: new BroadcastChannel(`scn-chat-store-${did}`) as never,
    open: async () => {
      await worker.open(did)
      if (firstOpen) {
        firstOpen = false
        void worker
          .syncIndex()
          .then(() => worker.reconcileIndex())
          .then(() => worker.backgroundDownload())
          .catch((err) => console.warn('Store sync failed', err))
      } else {
        void worker.syncIndex().catch((err) => console.warn('Store sync failed', err))
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
    worker,
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
      if ((await handover.claim()) !== 'active')
        throw new Error('Another tab is using this device copy. Close it and try again.')
      await worker.deleteDatabase(did)
    },
  }
}
