import { Markdown } from '../../../parts/markdown.tsx'
import { Reasoning } from '../../../parts/ReasoningView.tsx'
import type { StreamedReply } from '../lib/reply-stream.ts'

interface Props {
  streaming: StreamedReply
}

/** The reasoning and text streamed so far, shown until the reply's record arrives. */
export function StreamingReply(props: Props) {
  return (
    <>
      {props.streaming.reasoning && <Reasoning text={props.streaming.reasoning} />}
      {props.streaming.text && <Markdown text={props.streaming.text} />}
    </>
  )
}
