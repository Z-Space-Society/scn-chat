import type { BlobUrl } from '../../../parts/types.ts'
import type { ReplyParts } from '../lib/reply-stream.ts'
import { PartsView } from './PartsView.tsx'
import { statusLine } from './Status.tsx'

interface Props {
  reply: ReplyParts
  blobUrl: BlobUrl
  /** The reply's key, so its steps' times carry over to the finished record. */
  rkey?: string
}

/** The reply's record as far as the stream goes, for the part views that read it. */
const streaming = { role: 'assistant', status: 'pending' }

/**
 * The reply streamed so far, step by step, shown until the reply's record arrives. Before anything
 * arrives the reply's header shows it waiting, so this only explains a wait for the rate limit or
 * a busy provider.
 */
export function StreamingReply(props: Props) {
  if (props.reply.queued)
    return (
      <p className={statusLine}>In line: you have started the most replies allowed this minute.</p>
    )
  return (
    <>
      <PartsView
        parts={props.reply.parts}
        record={streaming}
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
