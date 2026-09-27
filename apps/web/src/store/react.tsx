import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { messageOf } from '../components/useAction.ts'
import type { StoreClient } from './client.ts'
import type { Conversation, ConversationSummary } from './core.ts'
import { isStoreClosed } from './errors.ts'
import type { HandoverState } from './handover.ts'

const StoreContext = createContext<StoreClient | null>(null)

export function StoreProvider({ store, children }: { store: StoreClient; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): StoreClient {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore needs a StoreProvider')
  return store
}

export function useStoreState(): HandoverState {
  const store = useStore()
  const [state, setState] = useState(store.state())
  useEffect(() => store.onState(setState), [store])
  return state
}

/** Report store failures, except for the store moving to another tab. */
function reportUnless(setError: (message: string) => void) {
  return (err: unknown) => {
    if (isStoreClosed(err)) return
    console.error(err)
    setError(messageOf(err))
  }
}

export function useConversations(): { conversations: ConversationSummary[]; error: string | null } {
  const store = useStore()
  const state = useStoreState()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (state !== 'active') return
    const load = () =>
      void store.worker.listConversations().then(setConversations, reportUnless(setError))
    load()
    return store.onChange((change) => change.type === 'index' && load())
  }, [store, state])
  return { conversations, error }
}

/** A conversation from the local copy, shown at once and refreshed from the PDS when opened. */
export function useConversation(skey: string): {
  conversation: Conversation | null
  error: string | null
} {
  const store = useStore()
  const state = useStoreState()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (state !== 'active') return
    const report = reportUnless(setError)
    const load = () => void store.worker.getConversation(skey).then(setConversation, report)
    load()
    store.worker
      .refreshConversation(skey)
      .then(() => store.worker.reconcileConversation(skey))
      .catch(report)
    return store.onChange(
      (change) => change.type === 'conversation' && change.skey === skey && load(),
    )
  }, [store, state, skey])
  return { conversation, error }
}
