import {
  queryOptions,
  experimental_streamedQuery as streamedQuery,
  type UseQueryResult,
  useQueries,
  useQuery,
} from '@tanstack/react-query'
import { useState } from 'react'
import { isFinished, isPending } from '../../shared/message.ts'
import { refreshConversation, useRefreshConversation } from '../../store/react.tsx'
import type { BranchMessage } from './lib/branch.ts'
import { addEvents, noParts, type ReplyParts, replyEvents } from './lib/reply-stream.ts'

/*
 * The reply follower: it follows each pending reply in the open conversation until its final
 * record arrives. The conversation follows its replies with `useReplyFollower`, and a reply's
 * views read what has streamed with `useFollowedReply` and `useReplyStarted`, which never start a
 * stream themselves, so each delta rerenders only the views that show it.
 */

const POLL_START_MS = 2_000
const POLL_MAX_MS = 30_000

/** A reply's stream, reduced to its parts so far. A finished status refreshes the conversation. */
const streamQuery = (skey: string, rkey: string) =>
  queryOptions({
    queryKey: ['reply-stream', skey, rkey],
    queryFn: streamedQuery({
      streamFn: async function* ({ client, signal }) {
        const url = `/api/conversations/${skey}/messages/${rkey}/stream`
        for await (const events of replyEvents(url, signal)) {
          yield events
          if (events.some((event) => event.type === 'status' && isFinished(event.status)))
            void refreshConversation(client, skey)
        }
      },
      reducer: addEvents,
      initialValue: noParts,
    }),
    // A stream runs once. Leaving the conversation drops it, and coming back follows again.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  })

/** Whether each stream has ended, by failing or by finishing. */
const endedStreams = (results: UseQueryResult[]) =>
  results.map((result) => result.isError || (result.isSuccess && result.fetchStatus === 'idle'))

/**
 * Follow each pending reply's stream, and refresh the conversation when one finishes. A reply
 * still pending after its stream ends, because the stream dropped or another server runs it, is
 * polled for with a backoff until it leaves pending. `follow` follows a reply just sent, before its
 * pending record reaches the local copy.
 */
export function useReplyFollower(skey: string, messages: BranchMessage[]) {
  const refresh = useRefreshConversation()
  const pending = messages.filter((m) => isPending(m.record)).map((m) => m.rkey)
  const [followed, setFollowed] = useState<string[]>([])
  const follow = (rkey: string) =>
    setFollowed((current) => (current.includes(rkey) ? current : [...current, rkey]))
  // A reply followed since it was sent, until the local copy has its final record, which the
  // conversation shows instead. Its stream then goes, and what streamed with it.
  const final = new Set(messages.filter((m) => !isPending(m.record)).map((m) => m.rkey))
  const rkeys = [...new Set([...pending, ...followed.filter((rkey) => !final.has(rkey))])]
  // Only whether each stream has ended, so a delta doesn't rerender the conversation.
  const ended = useQueries({
    queries: rkeys.map((rkey) => streamQuery(skey, rkey)),
    combine: endedStreams,
  })
  const waiting = pending.filter((rkey) => ended[rkeys.indexOf(rkey)])

  useQuery({
    // A new key for each set of replies waited on, so each wait starts its backoff over.
    queryKey: ['reply-poll', skey, ...waiting],
    queryFn: async () => {
      await refresh(skey)
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

/**
 * Why a followed reply is no longer live while it is still pending: its stream dropped, or its
 * status says another server runs it. Either way the follower checks for its record instead.
 */
export type NotLive = 'dropped' | 'elsewhere' | null

/** A followed reply as its views show it. */
export interface FollowedReply {
  /** What has streamed so far, or null before the stream has begun. */
  streamed: ReplyParts | null
  notLive: NotLive
}

/** A followed reply as it streams, rerendering with each delta. */
export function useFollowedReply(skey: string, rkey: string): FollowedReply {
  const { data, isError } = useQuery({ ...streamQuery(skey, rkey), enabled: false })
  // A status that isn't final means another server runs the reply.
  const elsewhere = Boolean(data?.status && !isFinished(data.status))
  return {
    streamed: data ?? null,
    notLive: isError ? 'dropped' : elsewhere ? 'elsewhere' : null,
  }
}

/** Whether anything of a followed reply has arrived, rerendering only once it has. */
export function useReplyStarted(skey: string, rkey: string): boolean {
  const { data } = useQuery({
    ...streamQuery(skey, rkey),
    enabled: false,
    select: (reply) => reply.parts.some(Boolean),
  })
  return data ?? false
}
