import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { messageOf } from '../lib/errors.ts'
import type { StoreClient } from './client.ts'
import type { Conversation, ConversationSummary } from './core.ts'
import { isStoreClosed } from './errors.ts'
import type { HandoverState } from './handover.ts'
import type { SearchResult } from './search.ts'

const StoreContext = createContext<StoreClient | null>(null)

/** Provide the store, and turn its change events into stale queries. */
export function StoreProvider({ store, children }: { store: StoreClient; children: ReactNode }) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      store.onChange((change) => {
        if (change.type === 'index')
          void queryClient.invalidateQueries({ queryKey: ['conversations'] })
        if (change.type === 'conversation')
          void queryClient.invalidateQueries({
            queryKey: ['conversation', change.skey],
            exact: true,
          })
        // Any change can add results or finish a download.
        void queryClient.invalidateQueries({ queryKey: ['search'] })
      }),
    [store, queryClient],
  )
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

/** A store failure's message, except for the store moving to another tab. */
const storeError = (err: unknown) => (!err || isStoreClosed(err) ? null : messageOf(err))

export function useConversations(): { conversations: ConversationSummary[]; error: string | null } {
  const store = useStore()
  const active = useStoreState() === 'active'
  const { data, error } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => store.worker.listConversations(),
    enabled: active,
  })
  return { conversations: data ?? [], error: storeError(error) }
}

/** The query that refreshes a conversation from the PDS. Invalidating it refreshes again. */
export const conversationRefreshKey = (skey: string) => ['conversation', skey, 'refresh']

/** A conversation from the local copy, shown at once and refreshed from the PDS when opened. */
export function useConversation(skey: string): {
  conversation: Conversation | null
  error: string | null
} {
  const store = useStore()
  const active = useStoreState() === 'active'
  const local = useQuery({
    queryKey: ['conversation', skey],
    queryFn: () => store.worker.getConversation(skey),
    enabled: active,
  })
  // The refresh's changes arrive as store events, which update the local query.
  const refreshed = useQuery({
    queryKey: conversationRefreshKey(skey),
    queryFn: async () => {
      await store.worker.refreshConversation(skey)
      await store.worker.reconcileConversation(skey)
      return true
    },
    enabled: active,
  })
  return { conversation: local.data ?? null, error: storeError(local.error ?? refreshed.error) }
}

/** Search the local copy, rerunning as the download and live changes add to it. */
export function useChatSearch(query: string): {
  results: SearchResult[]
  remaining: number
  error: string | null
} {
  const store = useStore()
  const active = useStoreState() === 'active'
  const { data, error } = useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      const [results, remaining] = await Promise.all([
        store.worker.search(query),
        store.worker.remainingDownloads(),
      ])
      return { results, remaining }
    },
    enabled: active && query.trim() !== '',
    placeholderData: keepPreviousData,
  })
  return { results: data?.results ?? [], remaining: data?.remaining ?? 0, error: storeError(error) }
}
