import { cn } from '../../../shared/cn.ts'
import { Loading, Skeleton, SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { sectionHeading, sidebarRow, sidebarScroll } from '../../../shared/ui/sidebar.ts'

/** The widths of the skeleton's chat titles, so the rows read as a list of different chats. */
const titles = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5', 'w-1/2']

interface RowsProps {
  /** Whether it heads the rows with a date's heading, as the chat list does. */
  heading?: boolean
  label: string
  /** Whether they show at once, as in the page's frame. */
  immediate?: boolean
  /** How many rows, fewer for the next page at the end of a list than for a whole list. */
  rows?: number
}

/** Chats on their way, in the shape of the sidebar's rows: one-line titles of differing lengths. */
export function ChatRowsSkeleton(props: RowsProps) {
  return (
    <Loading label={props.label} immediate={props.immediate}>
      {props.heading && (
        <div className={cn(sectionHeading, 'mt-0')}>
          <SkeletonText className="w-12" />
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {titles.slice(0, props.rows).map((width, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows are a fixed set, in order.
          <div key={index} className={cn(sidebarRow, 'hover:bg-transparent')}>
            <SkeletonText className={width} />
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** A search on its way, in the place its results will take. */
export function SearchSkeleton() {
  return (
    <div className={sidebarScroll}>
      <ChatRowsSkeleton label="Searching" />
    </div>
  )
}

/**
 * The whole chat sidebar while the page's code loads: New chat and search, the chats, and the
 * account at the foot, each in its own shape, so nothing moves as the real ones take their places.
 */
export function ChatListSkeleton() {
  return (
    <>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Skeleton className="h-row min-w-0 flex-1 rounded-row" />
        <Skeleton className="size-row flex-none rounded-row" />
      </div>
      <div className={sidebarScroll}>
        <ChatRowsSkeleton heading immediate label="Loading chats" />
      </div>
      {/* The account menu's button pads the card. */}
      <footer className="flex items-center p-1.5 pe-2.5 pt-2.5">
        <AccountSkeleton />
      </footer>
    </>
  )
}

/** The account card on its way: the avatar's tile beside a line for the name. */
function AccountSkeleton() {
  return (
    <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-2.5">
      <Skeleton className="size-8 flex-none" />
      <SkeletonText className="w-24 text-small leading-[1.2]" />
    </span>
  )
}
