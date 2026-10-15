import type { ReactNode } from 'react'
import { cn } from '../cn.ts'

interface BadgeProps {
  /** Green for what is live or good, amber for what needs noticing, red for what failed, grey otherwise. */
  tone?: 'good' | 'warning' | 'danger'
  title?: string
  className?: string
  children: ReactNode
}

/** A small status label, such as a plugin's state or a role. */
export function Badge(props: BadgeProps) {
  return (
    <span
      title={props.title}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-badge bg-hover px-1.75 py-px font-semibold text-caption text-muted',
        props.tone === 'good' && 'bg-accent-soft text-accent-strong',
        props.tone === 'warning' && 'bg-highlight text-highlight-ink',
        props.tone === 'danger' && 'bg-danger-soft text-danger',
        props.className,
      )}
    >
      {props.children}
    </span>
  )
}

interface ChipProps {
  title?: string
  children: ReactNode
}

/** A short value, such as a role or a domain, as a grey chip. */
export function Chip(props: ChipProps) {
  return (
    <span
      title={props.title}
      className="inline-flex items-center gap-1.25 whitespace-nowrap rounded-badge bg-surface px-1.75 py-px font-medium text-caption text-ink"
    >
      {props.children}
    </span>
  )
}

interface ChipsProps {
  values: readonly string[]
}

/** Short values as chips, or a quiet None. */
export function Chips(props: ChipsProps) {
  if (!props.values.length) return <span className="text-muted text-small">None</span>
  return (
    <span className="flex flex-wrap items-center gap-1.25">
      {props.values.map((value) => (
        <Chip key={value}>{value}</Chip>
      ))}
    </span>
  )
}
