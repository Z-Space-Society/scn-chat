import { useLayoutEffect, useState } from 'react'
import { Loading, SkeletonText } from '../../../shared/ui/Skeleton.tsx'

/** The widths of each paragraph's lines, each ending short as a paragraph does. */
const paragraphs = [
  ['w-full', 'w-11/12', 'w-full', 'w-3/5'],
  ['w-full', 'w-4/5', 'w-2/5'],
]

interface Props {
  /** Whether it shows at once, as in a page the server sends. */
  immediate?: boolean
  className?: string
}

/**
 * Whether the conversation's skeleton on screen showed at once. On a reload the page's frame
 * shows one, then the conversation's column and the conversation each show their own in its
 * place, and they carry on showing rather than vanishing to fade in again.
 */
let shownAtOnce = false

/** A conversation on its way, read out once as loading. */
export function ConversationSkeleton(props: Props) {
  // It renders while the skeleton it replaces is still on the page, which lets go as it leaves.
  const [immediate] = useState(() => Boolean(props.immediate) || shownAtOnce)
  useLayoutEffect(() => {
    shownAtOnce = immediate
    return () => {
      shownAtOnce = false
    }
  }, [immediate])
  return (
    <Loading label="Loading messages" immediate={immediate} className={props.className}>
      <MessagesSkeleton />
    </Loading>
  )
}

/**
 * Messages on their way: a few paragraphs of text, spaced as a reply's are, with no bubble or
 * name, since who said what isn't known yet.
 */
export function MessagesSkeleton() {
  return (
    <div className="mt-5.5 flex flex-col gap-4 font-prose text-body leading-[1.65]">
      {paragraphs.map((lines, paragraph) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the paragraphs are a fixed set, in order.
        <div key={paragraph}>
          {lines.map((width, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines are a fixed set, in order.
            <SkeletonText key={index} className={width} />
          ))}
        </div>
      ))}
    </div>
  )
}
