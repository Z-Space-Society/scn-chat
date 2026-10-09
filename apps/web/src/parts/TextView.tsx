import { Markdown } from './markdown.tsx'
import type { PartViewProps } from './types.ts'

/** Text as Markdown from the assistant, and as plain text from the user. */
export function TextView(props: PartViewProps) {
  const text = props.part.text as string
  if (props.record.role === 'assistant') return <Markdown text={text} />
  return <p className="text">{text}</p>
}
