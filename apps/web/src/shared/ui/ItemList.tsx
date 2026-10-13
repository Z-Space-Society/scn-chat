import type { ReactNode } from 'react'
import { cn } from '../cn.ts'
import { ChevronRightIcon } from '../icons.tsx'

/*
 * Lists of things in a card, such as keys, members, or plugins: a row each, with its names and its
 * actions at the end, divided by lines inset to their text.
 */

interface ListProps {
  'aria-label'?: string
  children: ReactNode
}

export function ItemList(props: ListProps) {
  return <ul aria-label={props['aria-label']}>{props.children}</ul>
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
export function ItemMark(props: MarkProps) {
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
export function ItemNames(props: NamesProps) {
  const details = props.details?.filter(Boolean) ?? []
  return (
    <span className={cn('flex min-w-32 flex-1 flex-col leading-[1.35]', props.className)}>
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
  /** The link to the item's page, whose name is all a screen reader reads for the row. */
  link: ReactNode
  description?: ReactNode
  details?: ReactNode[]
  /** Buttons on the row, which still act on their own above the link. */
  actions?: ReactNode
}

/**
 * A row that opens a page, such as a role or a plugin: its link stretches over the whole row, and
 * a chevron marks it as a way in.
 */
export function LinkItem(props: LinkItemProps) {
  return (
    <li
      className={cn(
        row,
        'relative flex-nowrap has-[strong_a:focus-visible]:outline-2 has-[strong_a:focus-visible]:outline-focus has-[strong_a:focus-visible]:-outline-offset-2 hover:has-[strong_a:hover]:bg-row-hover [&_button]:relative [&_button]:z-1',
      )}
    >
      <ItemNames
        title={props.link}
        description={props.description}
        details={props.details}
        className="gap-0.5 [&_strong_a]:no-underline [&_strong_a]:after:absolute [&_strong_a]:after:inset-0 [&_strong_a]:focus-visible:outline-none"
      />
      {props.actions}
      <ChevronRightIcon className="text-icon-quiet" />
    </li>
  )
}
