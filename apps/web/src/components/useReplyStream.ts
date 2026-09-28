import { useCallback, useEffect, useRef, useState } from 'react'

export type StreamedReply = { text: string; reasoning: string }

const FINISHED = new Set(['complete', 'error', 'cancelled'])
const POLL_START_MS = 2_000
const POLL_MAX_MS = 30_000

/** Follow a reply's stream, then refresh it from the store when it ends, polling if the stream drops. */
export function useReplyStream(
  skey: string,
  refresh: () => Promise<void>,
  isPending: (rkey: string) => boolean,
) {
  const [streams, setStreams] = useState<Record<string, StreamedReply>>({})
  const sources = useRef(new Map<string, EventSource>())
  const ended = useRef(new Set<string>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  // Keep the latest isPending in a ref for the polling timers to read.
  const pending = useRef(isPending)
  pending.current = isPending

  /** Refresh until the reply is no longer pending, backing off between tries. */
  const poll = useCallback(
    (replyRkey: string, delay = POLL_START_MS) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        refresh().then(
          () => pending.current(replyRkey) && poll(replyRkey, Math.min(delay * 2, POLL_MAX_MS)),
          (err: unknown) => {
            console.warn('Polling a reply failed', err)
            poll(replyRkey, Math.min(delay * 2, POLL_MAX_MS))
          },
        )
      }, delay)
      timers.current.add(timer)
    },
    [refresh],
  )

  const follow = useCallback(
    (replyRkey: string) => {
      if (sources.current.has(replyRkey) || ended.current.has(replyRkey)) return
      const source = new EventSource(`/api/conversations/${skey}/messages/${replyRkey}/stream`)
      sources.current.set(replyRkey, source)
      const kinds: string[] = []
      const parts: string[] = []
      const finish = () => {
        source.close()
        sources.current.delete(replyRkey)
        ended.current.add(replyRkey)
        setStreams(({ [replyRkey]: _done, ...rest }) => rest)
      }
      const collect = (reasoning: boolean) =>
        parts.filter((text, i) => text && (kinds[i] === 'reasoningPart') === reasoning).join('\n\n')
      source.addEventListener('part-start', (event) => {
        const { index, partType } = JSON.parse((event as MessageEvent).data) as {
          index: number
          partType: string
        }
        kinds[index] = partType
      })
      source.addEventListener('delta', (event) => {
        const { index, text } = JSON.parse((event as MessageEvent).data) as {
          index: number
          text: string
        }
        parts[index] = (parts[index] ?? '') + text
        setStreams((current) => ({
          ...current,
          [replyRkey]: {
            text: collect(false),
            reasoning: collect(true),
          },
        }))
      })
      source.addEventListener('status', (event) => {
        finish()
        const { status } = JSON.parse((event as MessageEvent).data) as { status: string }
        // Other statuses mean this server isn't running the reply, so wait for it elsewhere.
        if (!FINISHED.has(status)) return poll(replyRkey)
        refresh().catch((err: unknown) => console.warn('Refreshing a finished reply failed', err))
      })
      source.onerror = () => {
        finish()
        poll(replyRkey)
      }
    },
    [skey, refresh, poll],
  )

  useEffect(
    () => () => {
      for (const source of sources.current.values()) source.close()
      for (const timer of timers.current) clearTimeout(timer)
    },
    [],
  )

  return { streams, follow }
}
