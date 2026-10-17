import { createContext, useContext, useEffect, useState } from 'react'
import { formatSeconds } from '../../../parts/step-clock.ts'
import type { BlobUrl } from '../../../parts/types.ts'
import type { MessageRecord } from '../../../shared/message.ts'
import { parseDate } from '../../../shared/time.ts'
import type { ReplyParts } from '../lib/reply-stream.ts'
import { useFollowedReply, useReplyStarted } from '../reply-follower.ts'
import { PartsView } from './PartsView.tsx'
import { statusLine } from './Status.tsx'

/**
 * The conversation whose pending replies the reply follower follows, by its key. Where there is
 * none, as on a shared page, a pending reply shows only that it is waiting.
 */
export const FollowedConversation = createContext<string | null>(null)

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

interface AuthorProps {
  /** The reply's key, which its stream is followed by. */
  rkey?: string
  model: string
  /** When the reply was created, to count the wait from. */
  since?: unknown
}

/**
 * A pending reply's header in place of its author: waiting until its stream shows something, then
 * the model's name. It rerenders only once the reply starts, not with each delta.
 */
export function PendingAuthor(props: AuthorProps) {
  const skey = useContext(FollowedConversation)
  if (!skey || !props.rkey) return <WaitingAuthor model={props.model} since={props.since} />
  return <LiveAuthor skey={skey} rkey={props.rkey} model={props.model} since={props.since} />
}

interface LiveAuthorProps {
  skey: string
  rkey: string
  model: string
  since?: unknown
}

function LiveAuthor(props: LiveAuthorProps) {
  const started = useReplyStarted(props.skey, props.rkey)
  if (!started) return <WaitingAuthor model={props.model} since={props.since} />
  return <strong>{props.model}</strong>
}

interface BodyProps {
  rkey?: string
  /** The pending record, which the part views read as the stream's. */
  record: MessageRecord
  blobUrl: BlobUrl
}

/**
 * A pending reply's stream as it arrives, from the reply follower, so each delta rerenders this
 * alone. Until something arrives it shows nothing, and the reply's header says it is waiting.
 * Once the stream ends with the reply unfinished, it says the conversation is checking the PDS for
 * the reply instead. The finished record replaces all of it.
 */
export function PendingBody(props: BodyProps) {
  const skey = useContext(FollowedConversation)
  if (!skey || !props.rkey) return null
  return <ReplyStream skey={skey} rkey={props.rkey} record={props.record} blobUrl={props.blobUrl} />
}

interface StreamProps {
  skey: string
  rkey: string
  record: MessageRecord
  blobUrl: BlobUrl
}

function ReplyStream(props: StreamProps) {
  const { streamed, notLive } = useFollowedReply(props.skey, props.rkey)
  return (
    <>
      {streamed && (
        <StreamingReply
          reply={streamed}
          record={props.record}
          blobUrl={props.blobUrl}
          rkey={props.rkey}
        />
      )}
      {notLive === 'dropped' && (
        <p className={statusLine}>Lost the live stream. Checking for the reply…</p>
      )}
      {notLive === 'elsewhere' && (
        <p className={statusLine}>Not streaming on this server. Checking for the reply…</p>
      )}
    </>
  )
}

interface StreamingReplyProps {
  reply: ReplyParts
  record: MessageRecord
  blobUrl: BlobUrl
  /** The reply's key, so its steps' times carry over to the finished record. */
  rkey?: string
}

/**
 * The reply streamed so far, step by step. Before anything arrives the reply's header shows it
 * waiting, so this only explains a wait for the rate limit or a busy provider.
 */
export function StreamingReply(props: StreamingReplyProps) {
  if (props.reply.queued)
    return (
      <p className={statusLine}>In line: you have started the most replies allowed this minute.</p>
    )
  return (
    <>
      <PartsView
        parts={props.reply.parts}
        record={props.record}
        live
        blobUrl={props.blobUrl}
        scope={props.rkey}
      />
      {props.reply.retrying && (
        <p role="status" className={statusLine}>
          The model's provider is busy. Trying again…
        </p>
      )}
    </>
  )
}
