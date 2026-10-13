import { Loading, Skeleton, SkeletonText } from '../../../shared/ui/Skeleton.tsx'

/** The widths of the reply's lines, ending short as a paragraph does. */
const lines = ['w-full', 'w-11/12', 'w-full', 'w-3/5']

interface Props {
  /** Whether it shows at once, as in a page the server sends. */
  immediate?: boolean
  className?: string
}

/** A conversation on its way, read out once as loading. */
export function ConversationSkeleton(props: Props) {
  return (
    <Loading label="Loading messages" immediate={props.immediate} className={props.className}>
      <TurnSkeleton />
    </Loading>
  )
}

/**
 * The shape of a conversation's first turn: your message's bubble at the end, then a reply's name
 * over a paragraph of its text.
 */
export function TurnSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="mt-5.5 h-11 w-2/5 self-end rounded-bubble" />
      <div className="mt-turn">
        <SkeletonText className="mb-0.75 w-24 text-caption" />
        <div className="font-prose text-body leading-[1.65]">
          {lines.map((width, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines are a fixed set, in order.
            <SkeletonText key={index} className={width} />
          ))}
        </div>
      </div>
    </div>
  )
}
