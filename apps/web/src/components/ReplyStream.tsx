import { useQuery } from '@tanstack/react-query'
import { streamedReply } from '../lib/reply-stream.ts'
import { StreamingReply } from './MessageView.tsx'
import { replyStreamQuery } from './useReplyStream.ts'

/**
 * A pending reply's stream as it arrives. The conversation starts the stream and this only reads
 * it, so each delta rerenders this alone.
 */
export function ReplyStream({ skey, rkey }: { skey: string; rkey: string }) {
  const { data } = useQuery({
    ...replyStreamQuery(skey, rkey),
    enabled: false,
    select: streamedReply,
  })
  return data === undefined ? <p>Thinking...</p> : <StreamingReply streaming={data} />
}
