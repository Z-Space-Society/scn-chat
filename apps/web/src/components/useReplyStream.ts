import {
  experimental_streamedQuery as streamedQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  addEvent,
  FINISHED,
  noParts,
  replyEvents,
  type StreamedReply,
  streamedReply,
} from '../lib/reply-stream.ts'
import { conversationRefreshKey, useStore } from '../store/react.tsx'

const POLL_START_MS = 2_000
const POLL_MAX_MS = 30_000

/**
 * Follow each pending reply's stream, and refresh the conversation when one finishes. A reply
 * still pending after its stream ends, because the stream dropped or another server runs it, is
 * polled for with a backoff until it leaves pending.
 */
export function useReplyStream(skey: string, pending: string[]) {
  const store = useStore()
  const queryClient = useQueryClient()
  // Replies followed as soon as they are sent, before their pending record reaches the local copy.
  const [followed, setFollowed] = useState<string[]>([])
  const follow = useCallback(
    (rkey: string) =>
      setFollowed((current) => (current.includes(rkey) ? current : [...current, rkey])),
    [],
  )
  const rkeys = [...new Set([...pending, ...followed])]
  const results = useQueries({
    queries: rkeys.map((rkey) => ({
      queryKey: ['reply-stream', skey, rkey],
      queryFn: streamedQuery({
        streamFn: async function* ({ signal }) {
          const url = `/api/conversations/${skey}/messages/${rkey}/stream`
          for await (const event of replyEvents(url, signal)) {
            yield event
            if (event.type === 'status' && FINISHED.has(event.status))
              void queryClient.invalidateQueries({ queryKey: conversationRefreshKey(skey) })
          }
        },
        reducer: addEvent,
        initialValue: noParts,
      }),
      // A stream runs once. Leaving the conversation drops it, and coming back follows again.
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 0,
    })),
  })

  const streams: Record<string, StreamedReply> = {}
  const ended: string[] = []
  rkeys.forEach((rkey, i) => {
    const result = results[i]
    if (result?.data) streams[rkey] = streamedReply(result.data)
    if (result?.isError || (result?.isSuccess && result.fetchStatus === 'idle')) ended.push(rkey)
  })
  const waiting = pending.filter((rkey) => ended.includes(rkey))

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

  return { streams, follow }
}
