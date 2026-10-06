import { useQuery } from '@tanstack/react-query'
import { replyStreamQuery } from '../hooks/useReplyStream.ts'
import { streamedReply } from '../lib/reply-stream.ts'
import { StreamingReply } from './MessageView.tsx'

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
  if (data === undefined) return <p>Thinking...</p>
  return <StreamingReply streaming={data} />
}
