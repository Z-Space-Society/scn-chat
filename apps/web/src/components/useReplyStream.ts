import { useCallback, useEffect, useRef, useState } from 'react'

/** Follow a reply's stream, then refresh it from the store when it ends, polling if the stream drops. */
export function useReplyStream(
  skey: string,
  refresh: () => Promise<void>,
  isPending: (rkey: string) => boolean,
) {
  const [streams, setStreams] = useState<Record<string, string>>({})
  const sources = useRef(new Map<string, EventSource>())
  const polls = useRef(new Set<ReturnType<typeof setInterval>>())
  // Keep the latest isPending in a ref for the polling interval to read.
  const pending = useRef(isPending)
  pending.current = isPending

  const follow = useCallback(
    (replyRkey: string) => {
      if (sources.current.has(replyRkey)) return
      const source = new EventSource(`/api/conversations/${skey}/messages/${replyRkey}/stream`)
      sources.current.set(replyRkey, source)
      const parts: string[] = []
      const finish = () => {
        source.close()
        sources.current.delete(replyRkey)
        setStreams(({ [replyRkey]: _done, ...rest }) => rest)
      }
      source.addEventListener('delta', (event) => {
        const { index, text } = JSON.parse((event as MessageEvent).data) as {
          index: number
          text: string
        }
        parts[index] = (parts[index] ?? '') + text
        setStreams((current) => ({ ...current, [replyRkey]: parts.filter(Boolean).join('\n\n') }))
      })
      source.addEventListener('status', () => {
        finish()
        refresh().catch((err: unknown) => console.warn('Refreshing a finished reply failed', err))
      })
      source.onerror = () => {
        finish()
        const poll = setInterval(() => {
          refresh().then(
            () => {
              if (pending.current(replyRkey)) return
              clearInterval(poll)
              polls.current.delete(poll)
            },
            (err: unknown) => console.warn('Polling a reply failed', err),
          )
        }, 2_000)
        polls.current.add(poll)
      }
    },
    [skey, refresh],
  )

  useEffect(
    () => () => {
      for (const source of sources.current.values()) source.close()
      for (const poll of polls.current) clearInterval(poll)
    },
    [],
  )

  return { streams, follow }
}
