import { cn } from '../../../shared/cn.ts'
import { SkeletonText } from '../../../shared/ui/Skeleton.tsx'

/** The conversation header's row, shared with its frame so the two sit in the same place. */
export const headerBar = cn(
  // Out of the centered column to the panel's edges.
  'group/header sticky top-0 isolate z-1 mx-[calc((100%-100cqi)/2)] flex min-h-bar items-center gap-4 px-2.75 transition-[padding-inline-start] duration-(--dur-slide) ease-slide before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:-bottom-6 before:-z-1 before:bg-panel motion-reduce:transition-none before:[mask-image:linear-gradient(black_calc(100%-(--spacing(10))),transparent)]',
  // The title moves aside for the sidebar's toggle as the sidebar slides away, and back, and
  // stays clear of it on a narrow screen, where the sidebar is a drawer.
  'in-data-sidebar-collapsed:ps-[calc(--spacing(2.75)+var(--spacing-toggle)+--spacing(1.5))] max-wide:ps-[calc(--spacing(2.75)+var(--spacing-toggle)+--spacing(1.5))]',
)

/** The title on its way, a line where the title's text will be. */
export function TitleSkeleton() {
  return (
    <span className="min-w-0 flex-1 px-2.25 py-1.25 text-ui">
      <SkeletonText className="w-40 max-w-full" />
    </span>
  )
}

/**
 * The header while the conversation's code loads: its row with the title on its way, which keeps
 * the messages' skeleton clear of the sidebar's toggle, where the header will be.
 */
export function HeaderFrame() {
  return (
    <header className={headerBar}>
      <TitleSkeleton />
    </header>
  )
}
