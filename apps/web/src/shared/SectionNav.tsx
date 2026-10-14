import { type ActiveOptions, Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from './cn.ts'
import { ArrowLeftIcon } from './icons.tsx'
import { sidebarRow } from './ui/sidebar.ts'

export interface Section {
  to: NonNullable<LinkProps['to']>
  label: string
  icon?: ReactNode
  /** Whether only the section's own path counts as it, not the pages under it. */
  exact?: boolean
}

interface Props {
  sections: readonly Section[]
  /** When a section's link counts as the current page. */
  activeOptions: ActiveOptions
  /** A quiet label over the links, for sections in groups. */
  label?: string
  /** Whether the links lead out of these sections, set apart by a line above them. */
  apart?: boolean
}

/**
 * A list of links to a page's sections, marking the current one. Beside the section on a wide
 * screen, the open one is a grey tint.
 */
export function SectionNav(props: Props) {
  return (
    <div className={cn(props.apart && 'border-line border-t')}>
      {props.label && (
        <p className="mt-3 mb-0.75 px-row-inset font-semibold text-caption text-muted tracking-label">
          {props.label}
        </p>
      )}
      <ul className="flex flex-col gap-0.5">
        {props.sections.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              activeOptions={
                section.exact ? { ...props.activeOptions, exact: true } : props.activeOptions
              }
              className={cn(
                sidebarRow,
                'wide:hover:bg-surface/55 wide:aria-[current=page]:bg-surface',
              )}
            >
              {section.icon}
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface HeaderProps {
  title: string
}

/** The way back to the chats over the name of these sections, big beside them on a wide screen. */
export function NavHeader(props: HeaderProps) {
  return (
    <>
      <Link
        to="/"
        activeOptions={{ exact: true }}
        className={cn(sidebarRow, 'text-muted text-small hover:text-ink')}
      >
        <ArrowLeftIcon /> Back to chats
      </Link>
      <p className="mt-2.5 wide:mt-1 mb-1.5 wide:mb-3 px-row-inset font-semibold text-body text-ink-strong wide:text-title tracking-heading wide:tracking-title">
        {props.title}
      </p>
    </>
  )
}
