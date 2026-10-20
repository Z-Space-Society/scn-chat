import type { ReactNode } from 'react'
import { cn } from '../cn.ts'
import { ChevronRightIcon } from '../icons.tsx'
import { Loading, Skeleton, SkeletonText } from './Skeleton.tsx'

/*
 * Lists of things in a card, such as keys, members, or plugins: a row each, with its names and its
 * actions at the end, divided by lines inset to their text. Its parts are imported together, as
 * `import * as ItemList`, and composed:
 *
 *   <ItemList.Root>
 *     <ItemList.Item>
 *       <ItemList.Mark>A</ItemList.Mark>
 *       <ItemList.Names title="Admins" details={['3 members']} />
 *       <Button>Remove</Button>
 *     </ItemList.Item>
 *   </ItemList.Root>
 */

interface ListProps {
  'aria-label'?: string
  className?: string
  children: ReactNode
}

export function Root(props: ListProps) {
  return (
    <ul aria-label={props['aria-label']} className={props.className}>
      {props.children}
    </ul>
  )
}

interface LabelProps {
  children: ReactNode
}

/** A quiet label over a list in a card, such as who is waiting to sign in. */
export function Label(props: LabelProps) {
  return (
    <p className="px-card-pad pt-card-pad pb-0.5 font-semibold text-caption text-muted [&+ul>li:first-child]:pt-2">
      {props.children}
    </p>
  )
}

const row =
  'flex flex-wrap items-center gap-x-3.5 gap-y-2 p-card-pad transition-opacity duration-(--dur-feedback) [&+&]:relative [&+&]:before:absolute [&+&]:before:inset-x-card-pad [&+&]:before:top-0 [&+&]:before:border-t [&+&]:before:border-line'

interface ItemProps {
  /** Whether the item is on its way out, which fades it. */
  deleting?: boolean
  className?: string
  children: ReactNode
}

/** One thing in a list: a mark, its names, and its actions. */
export function Item(props: ItemProps) {
  return (
    <li
      data-deleting={props.deleting || undefined}
      className={cn(row, 'data-deleting:opacity-50', props.className)}
    >
      {props.children}
    </li>
  )
}

interface MarkProps {
  /** Whether it is a person's initial, in a circle, rather than a thing's. */
  initial?: boolean
  children: ReactNode
}

/** A small square beside an item's names, such as a person's initial. */
export function Mark(props: MarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 flex-none place-items-center rounded-small bg-surface font-semibold text-caption text-muted tabular-nums',
        props.initial && 'rounded-full',
      )}
    >
      {props.children}
    </span>
  )
}

interface NamesProps {
  /** What the item is, in full ink. */
  title: ReactNode
  /** A line of what it is for, under the title. */
  description?: ReactNode
  /** Short facts on one line, each after a dot, such as a role's member count and rules. */
  details?: ReactNode[]
  /** More lines under the title, such as an error. */
  children?: ReactNode
  className?: string
}

/** An item's names: its title over its description and details. */
export function Names(props: NamesProps) {
  const details = props.details?.filter(Boolean) ?? []
  return (
    <span
      data-names
      className={cn('flex min-w-32 flex-1 flex-col leading-[1.35]', props.className)}
    >
      <strong className="font-semibold text-ink-strong [overflow-wrap:anywhere]">
        {props.title}
      </strong>
      {props.description && <small className={small}>{props.description}</small>}
      {details.length > 0 && (
        // Each detail leads with a dot, and the line is pulled back over the first and clipped, so
        // a detail that wraps never starts its line with a dot.
        <small
          className={cn(
            small,
            '-ms-4 flex flex-wrap [clip-path:inset(0_0_0_--spacing(4))] *:before:inline-block *:before:w-4 *:before:text-center *:before:content-["·"] rtl:[clip-path:inset(0_--spacing(4)_0_0)]',
          )}
        >
          {details.map((detail, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: details are a fixed line, in order.
            <span key={index}>{detail}</span>
          ))}
        </small>
      )}
      {props.children}
    </span>
  )
}

const small = 'text-muted text-small [overflow-wrap:anywhere]'

interface LinkItemProps {
  /** Whether the item is on its way out, which fades it. */
  deleting?: boolean
  /** Its mark, names, and actions, as an item's. The names' title is a link to the item's page. */
  children: ReactNode
}

/**
 * A row that opens a page, such as a role or a plugin: the link in its title stretches over the
 * whole row, and is all a screen reader reads for it, and a chevron after its actions marks it as a
 * way in. Buttons on the row still act on their own above the link.
 */
export function LinkItem(props: LinkItemProps) {
  return (
    <li
      data-deleting={props.deleting || undefined}
      className={cn(
        row,
        'relative flex-nowrap has-[strong_a:focus-visible]:outline-2 has-[strong_a:focus-visible]:outline-focus has-[strong_a:focus-visible]:-outline-offset-2 hover:has-[strong_a:hover]:bg-row-hover data-deleting:opacity-50 [&_button]:relative [&_button]:z-1',
        '[&>[data-names]]:gap-0.5 [&_strong_a]:no-underline [&_strong_a]:after:absolute [&_strong_a]:after:inset-0 [&_strong_a]:focus-visible:outline-none',
      )}
    >
      {props.children}
      <ChevronRightIcon className="text-icon-quiet" />
    </li>
  )
}

interface SkeletonProps {
  /** Whether each row's mark is a person's initial, in a circle. */
  initial?: boolean
  className?: string
}

/** The widths of a list skeleton's rows, a title over a description, so they differ. */
const skeletonRows = [
  ['w-1/3', 'w-1/2'],
  ['w-1/4', 'w-2/5'],
  ['w-2/5', 'w-3/5'],
  ['w-1/3', 'w-1/3'],
  ['w-1/4', 'w-1/2'],
]

/** A list while it loads, in its rows' own shape: a mark beside a title over a description. */
export function RowsSkeleton(props: SkeletonProps) {
  return (
    <Loading className={props.className}>
      {skeletonRows.map(([title, description]) => (
        <div key={`${title}${description}`} className={row}>
          <Skeleton className={cn('size-8 flex-none', props.initial && 'rounded-full')} />
          <span className="flex min-w-32 flex-1 flex-col leading-[1.35]">
            <SkeletonText className={title} />
            <SkeletonText className={cn('text-small', description)} />
          </span>
        </div>
      ))}
    </Loading>
  )
}
