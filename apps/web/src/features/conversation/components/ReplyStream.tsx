import { useQuery } from '@tanstack/react-query'
import { streamedReply } from '../lib/reply-stream.ts'
import { replyStreamQuery } from '../queries.ts'
import { Thinking } from './Status.tsx'
import { StreamingReply } from './StreamingReply.tsx'

interface Props {
  skey: string
  rkey: string
}

/**
 * A pending reply's stream as it arrives. The conversation starts the stream and this only reads
 * it, so each delta rerenders this alone.
 */
export function ReplyStream(props: Props) {
  const { data } = useQuery({
    ...replyStreamQuery(props.skey, props.rkey),
    enabled: false,
    select: streamedReply,
  })
  if (data === undefined) return <Thinking />
  return <StreamingReply streaming={data} />
}
