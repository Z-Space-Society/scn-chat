import { siteOf } from './links.ts'
import type { PartViewProps } from './types.ts'

/** A source's title, or its site when it has none, with the site after a title. */
export function SourceView(props: PartViewProps) {
  const url = props.part.url as string
  const title = props.part.title as string | undefined
  return (
    <>
      <a
        href={url}
        title={url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate font-medium text-ink no-underline hover:text-accent-strong"
      >
        {title ?? siteOf(url)}
      </a>
      {title && <span className="flex-none text-muted">{siteOf(url)}</span>}
    </>
  )
}
