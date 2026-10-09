import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useSyncExternalStore } from 'react'
import { MeContext } from '../features/auth/session.ts'
import { reportUnauthorized } from '../shared/api.ts'
import { messageOf } from '../shared/errors.ts'
import { openStore, type StoreClient } from './client.ts'
import type { Conversation, ConversationSummary } from './core.ts'
import { isStoreClosed } from './errors.ts'
import type { HandoverState } from './handover.ts'
import type { SearchResult } from './search.ts'

const StoreContext = createContext<StoreClient | null>(null)

interface Props {
  store: StoreClient
  children: ReactNode
}

/**
 * Provide the store, and turn its change events into stale queries. Its sync finding the session
 * has ended is reported as a request finding it would be.
 */
export function StoreProvider(props: Props) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      props.store.onChange((change) => {
        if (change.type === 'unauthorized') return reportUnauthorized()
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
    [props.store, queryClient],
  )
  return <StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>
}

/**
 * The user's store for an action outside the chat routes, like signing out: the provided one, or
 * opened when the action runs, so a page like settings does not take the store from another tab
 * just by being open.
 */
export function useOpenStore(): () => StoreClient {
  const provided = useContext(StoreContext)
  const me = useContext(MeContext)
  return () => {
    if (provided) return provided
    if (!me) throw new Error('Opening the store needs a signed-in user')
    return openStore(me.did)
  }
}

export function useStore(): StoreClient {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore needs a StoreProvider')
  return store
}

export function useStoreState(): HandoverState {
  const store = useStore()
  return useSyncExternalStore(store.onState, store.state)
}

/** The store, and whether this tab holds it, which reading it waits for. */
function useActiveStore() {
  const store = useStore()
  return { store, active: useStoreState() === 'active' }
}

/** A store failure's message, except for the store moving to another tab. */
const storeError = (err: unknown) => (!err || isStoreClosed(err) ? null : messageOf(err))

export function useConversations(): { conversations: ConversationSummary[]; error: string | null } {
  const { store, active } = useActiveStore()
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
  const { store, active } = useActiveStore()
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
  const { store, active } = useActiveStore()
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
