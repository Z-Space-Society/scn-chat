import type { ReactNode } from 'react'
import { isWebUrl, siteOf } from '../links.ts'

interface PageTitleProps {
  url: string
  title: string
}

/**
 * A page from tool output: its title, linking to it in a new tab, over its site, quietly. A URL
 * that isn't a web page's shows its title alone, with nothing to follow.
 */
export function PageTitle(props: PageTitleProps) {
  if (!isWebUrl(props.url))
    return (
      <span className="block font-medium text-ink" dir="auto">
        {props.title}
      </span>
    )
  return (
    <>
      <a
        href={props.url}
        title={props.url}
        target="_blank"
        rel="noreferrer"
        dir="auto"
        className="block truncate font-medium text-ink no-underline hover:text-accent-strong"
      >
        {props.title}
      </a>
      <span className="block truncate text-caption text-muted">{siteOf(props.url)}</span>
    </>
  )
}

interface StepCodeProps {
  children: ReactNode
  dir?: 'auto' | 'ltr'
}

/** A tool's input or output as text, as it was sent or returned, scrolling when long. */
export function StepCode(props: StepCodeProps) {
  return (
    <pre
      dir={props.dir}
      className="mt-1.25 mb-0.75 max-h-80 overflow-auto whitespace-pre-wrap rounded-small bg-surface px-3.5 py-3 font-mono text-code-block text-ink leading-normal"
    >
      {props.children}
    </pre>
  )
}

interface ToolNoteProps {
  children: ReactNode
}

/** A quiet line in place of what a tool found, while it runs or when it found nothing. */
export function ToolNote(props: ToolNoteProps) {
  return <p className="mt-1.5 mb-1 text-muted">{props.children}</p>
}
