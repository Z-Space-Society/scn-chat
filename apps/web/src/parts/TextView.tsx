import { Markdown } from './markdown.tsx'
import { splitQuotes } from './quotes.ts'
import type { PartViewProps } from './types.ts'

/** Text as Markdown from the assistant, and as written from the user. */
export function TextView(props: PartViewProps) {
  const text = props.part.text as string
  if (props.record.role === 'assistant') return <Markdown text={text} />
  return <UserText text={text} />
}

interface UserTextProps {
  text: string
}

/**
 * The user's words as written, in their bubble, except that quoted lines, as a quote from a reply
 * sends, show as quotes: a well inside the bubble, quieter than the words around it, whose corner
 * nests in the bubble's.
 */
function UserText(props: UserTextProps) {
  const blocks = splitQuotes(props.text)
  const bubble =
    'whitespace-pre-wrap rounded-bubble bg-bubble px-5 py-2.5 font-medium text-accent-strong [overflow-wrap:anywhere] in-data-landed:animate-landed motion-reduce:animate-none'
  if (!blocks.some((block) => block.quote))
    return (
      <p dir="auto" className={bubble}>
        {props.text}
      </p>
    )
  // Each block takes its direction from its own text, so a quote can differ from the words after it.
  return (
    <div className={bubble}>
      {blocks.map((block, i) => {
        if (block.quote)
          return (
            <blockquote
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity beyond their place.
              key={i}
              dir="auto"
              className="-mx-1.75 mb-2.25 rounded-[calc(var(--radius-bubble)-(--spacing(2.5)))] bg-bubble-quote px-2.75 py-1.5 font-normal text-ui leading-[1.45] last:mb-0"
            >
              {block.text}
            </blockquote>
          )
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: blocks have no identity beyond their place.
          <p key={i} dir="auto" className="mb-3.5 last:mb-0">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}
