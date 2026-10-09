import { type UseQueryResult, useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useStore } from '../../../store/react.tsx'
import { replyStreamQuery } from '../queries.ts'

const POLL_START_MS = 2_000
const POLL_MAX_MS = 30_000

/** Whether each stream has ended, by failing or by finishing. */
const endedStreams = (results: UseQueryResult[]) =>
  results.map((result) => result.isError || (result.isSuccess && result.fetchStatus === 'idle'))

/**
 * Follow each pending reply's stream, and refresh the conversation when one finishes. A reply
 * still pending after its stream ends, because the stream dropped or another server runs it, is
 * polled for with a backoff until it leaves pending. `ReplyStream` shows each stream, and this
 * only learns when they end, so a delta doesn't rerender the conversation.
 */
export function useReplyStream(skey: string, pending: string[]) {
  const store = useStore()
  // Replies followed as soon as they are sent, before their pending record reaches the local copy.
  const [followed, setFollowed] = useState<string[]>([])
  const follow = (rkey: string) =>
    setFollowed((current) => (current.includes(rkey) ? current : [...current, rkey]))
  const rkeys = [...new Set([...pending, ...followed])]
  const ended = useQueries({
    queries: rkeys.map((rkey) => replyStreamQuery(skey, rkey)),
    combine: endedStreams,
  })
  const waiting = pending.filter((rkey) => ended[rkeys.indexOf(rkey)])

  useQuery({
    // A new key for each set of replies waited on, so each wait starts its backoff over.
    queryKey: ['conversation', skey, 'poll', ...waiting],
    queryFn: async () => {
      await store.worker.refreshConversation(skey)
      return true
    },
    enabled: waiting.length > 0,
    // Fresh data from the start, so only the interval polls, beginning one interval after the wait.
    initialData: true,
    staleTime: Number.POSITIVE_INFINITY,
    refetchInterval: (query) =>
      Math.min(
        POLL_START_MS * 2 ** (query.state.dataUpdateCount + query.state.errorUpdateCount),
        POLL_MAX_MS,
      ),
    refetchIntervalInBackground: true,
    gcTime: 0,
  })

  return { follow }
}
