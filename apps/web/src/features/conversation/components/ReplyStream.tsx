import type { BlobUrl } from '../../../parts/types.ts'
import { useFollowedReply } from '../reply-follower.ts'
import { statusLine } from './Status.tsx'
import { StreamingReply } from './StreamingReply.tsx'

interface Props {
  skey: string
  rkey: string
  blobUrl: BlobUrl
}

/**
 * A pending reply's stream as it arrives, from the reply follower, so each delta rerenders this
 * alone. Until something arrives it shows nothing, and the
 * reply's header says it is waiting. Once the stream ends with the reply unfinished, it says the
 * conversation is checking the PDS for the reply instead.
 */
export function ReplyStream(props: Props) {
  const { streamed, notLive } = useFollowedReply(props.skey, props.rkey)
  return (
    <>
      {streamed && <StreamingReply reply={streamed} blobUrl={props.blobUrl} rkey={props.rkey} />}
      {notLive === 'dropped' && (
        <p className={statusLine}>Lost the live stream. Checking for the reply…</p>
      )}
      {notLive === 'elsewhere' && (
        <p className={statusLine}>Not streaming on this server. Checking for the reply…</p>
      )}
    </>
  )
}
