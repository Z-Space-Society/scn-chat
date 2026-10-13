import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

interface Props {
  /** Its size and corner, from the spacing scale, as the content it stands in for has them. */
  className?: string
}

/** A shape standing in for content on its way, pulsing gently until it arrives. */
export function Skeleton(props: Props) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-skeleton rounded-small bg-skeleton motion-reduce:animate-none',
        props.className,
      )}
    />
  )
}

/**
 * A line of text on its way: as tall as a line of the text around it, with a bar as tall as
 * its capitals, so the words take its place without the page moving. Its width is the line's.
 */
export function SkeletonText(props: Props) {
  return (
    <span aria-hidden="true" className={cn('flex h-lh items-center', props.className)}>
      <Skeleton className="h-[1cap] w-full rounded-badge" />
    </span>
  )
}

interface LoadingProps {
  /** What is loading, read out in place of the shapes, such as "Loading chats". */
  label?: string
  /** Whether it shows at once, as in a page the server sends, which is the first thing painted. */
  immediate?: boolean
  className?: string
  children: ReactNode
}

/**
 * Skeletons for one piece of the page, read out once as loading. They show only after a quiet
 * wait, so content that arrives quickly never flashes them.
 */
export function Loading(props: LoadingProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        !props.immediate && 'animate-fade-in-late motion-reduce:animate-none',
        props.className,
      )}
    >
      <span className="sr-only">{props.label ?? 'Loading'}</span>
      {props.children}
    </div>
  )
}
