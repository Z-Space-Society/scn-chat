import { useEffect, useState } from 'react'
import { formatSeconds } from '../../../parts/step-clock.ts'
import { parseDate } from '../../../shared/time.ts'
import { useReplyStarted } from '../reply-follower.ts'

const secondsSince = (start: number) => Math.max(0, Math.floor((Date.now() - start) / 1000))

/** The whole seconds since a time, ticking as each one passes, or none without a time. */
function useSecondsSince(since: unknown): number | undefined {
  const start = parseDate(since)?.getTime()
  const [seconds, setSeconds] = useState(() => (start === undefined ? 0 : secondsSince(start)))
  useEffect(() => {
    if (start === undefined) return
    let timer: ReturnType<typeof setTimeout>
    // Wakes just after each whole second since the start, so each shows as it passes.
    const tick = () => {
      setSeconds(secondsSince(start))
      timer = setTimeout(tick, 1000 - ((Date.now() - start) % 1000) + 10)
    }
    tick()
    return () => clearTimeout(timer)
  }, [start])
  return start === undefined ? undefined : seconds
}

interface WaitingAuthorProps {
  model: string
  /** When the reply was created, to count the wait from. */
  since?: unknown
}

/**
 * The header of a reply that has shown nothing yet: the model's name, breathing at the slow pace of
 * the rest of the live work, and how long it has been waiting. A reply just asked for shows nothing
 * for a moment, then fades in its waiting header, so a quick one never flashes it.
 */
export function WaitingAuthor(props: WaitingAuthorProps) {
  const seconds = useSecondsSince(props.since)
  return (
    <strong className="in-data-arrived:animate-fade-in-late motion-reduce:animate-none">
      <span className="animate-breathe motion-reduce:animate-none">{props.model}</span>
      {seconds !== undefined && seconds > 0 && (
        <span className="animate-fade-in font-normal tabular-nums before:me-1.75 before:content-['·'] motion-reduce:animate-none">
          {formatSeconds(seconds)}
        </span>
      )}
    </strong>
  )
}

interface LiveAuthorProps {
  skey: string
  rkey: string
  model: string
  /** When the reply was created, to count the wait from. */
  since?: unknown
}

/**
 * The header of a pending reply, following its stream: waiting until something arrives, then the
 * model's name. It rerenders only once the reply starts, not with each delta.
 */
export function LiveAuthor(props: LiveAuthorProps) {
  const started = useReplyStarted(props.skey, props.rkey)
  if (!started) return <WaitingAuthor model={props.model} since={props.since} />
  return <strong>{props.model}</strong>
}
