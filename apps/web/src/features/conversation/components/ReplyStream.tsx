import { useQuery } from '@tanstack/react-query'
import type { BlobUrl } from '../../../parts/types.ts'
import { FINISHED } from '../lib/reply-stream.ts'
import { replyStreamQuery } from '../queries.ts'
import { statusLine } from './Status.tsx'
import { StreamingReply } from './StreamingReply.tsx'

interface Props {
  skey: string
  rkey: string
  blobUrl: BlobUrl
}

/**
 * A pending reply's stream as it arrives. The conversation starts the stream and this only reads
 * it, so each delta rerenders this alone. Until something arrives it shows nothing, and the
 * reply's header says it is waiting. Once the stream ends with the reply unfinished, it says the
 * conversation is checking the PDS for the reply instead.
 */
export function ReplyStream(props: Props) {
  const { data, isError } = useQuery({
    ...replyStreamQuery(props.skey, props.rkey),
    enabled: false,
  })
  // A status that is not final means this server is not running the reply.
  const elsewhere = Boolean(data?.status && !FINISHED.has(data.status))
  return (
    <>
      {data && <StreamingReply reply={data} blobUrl={props.blobUrl} rkey={props.rkey} />}
      {isError && <p className={statusLine}>Lost the live stream. Checking for the reply…</p>}
      {elsewhere && (
        <p className={statusLine}>Not streaming on this server. Checking for the reply…</p>
      )}
    </>
  )
}
