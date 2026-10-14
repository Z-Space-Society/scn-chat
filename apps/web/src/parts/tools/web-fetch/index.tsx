import { siteOf } from '../../links.ts'
import { clip } from '../../steps.ts'
import type { ToolEntry, ToolViewProps } from '../../types.ts'
import { DefaultToolView } from '../default/index.tsx'
import { parseJson } from '../json.ts'
import { PageTitle, StepCode, ToolNote } from '../ui.tsx'

/** The address a fetch asked for, by its site and path, or nothing when its input isn't one. */
function addressOf(input: string): string {
  const value = parseJson(input) as { url?: unknown } | undefined
  if (typeof value?.url !== 'string') return ''
  try {
    const url = new URL(value.url)
    const path = url.pathname === '/' ? '' : url.pathname
    return clip(`${siteOf(value.url)}${path}${url.search}`, 80)
  } catch {
    return clip(value.url, 80)
  }
}

interface Page {
  url: string
  title?: string
  content: string
  offset: number
  /** Where the next call would start reading, when this one stopped before the end. */
  nextOffset?: number
  totalCharacters: number
}

/** The page the plugin returned, as `{ url, title?, content, offset, nextOffset?, totalCharacters }`. */
function pageOf(output: unknown): Page | undefined {
  const page = parseJson(output) as Partial<Page> | null | undefined
  if (typeof page !== 'object' || page === null) return undefined
  if (typeof page.url !== 'string' || typeof page.content !== 'string') return undefined
  if (page.title !== undefined && typeof page.title !== 'string') return undefined
  if (typeof page.offset !== 'number' || typeof page.totalCharacters !== 'number') return undefined
  if (page.nextOffset !== undefined && typeof page.nextOffset !== 'number') return undefined
  return page as Page
}

const numbers = new Intl.NumberFormat()

/**
 * A fetched page: its title linking to the page, its site, which of its characters this call read
 * when there were more, and the text it read as plain text. Anything it can't read shows as the
 * default view.
 */
function WebFetchView(props: ToolViewProps) {
  if (props.status === 'running') return <ToolNote>Reading…</ToolNote>
  const readable = props.status === 'done' && !props.result?.outputBlob
  const page = readable ? pageOf(props.result?.output) : undefined
  if (!page) return <DefaultToolView {...props} />
  // A read that stopped before the end says where the next one starts, and one that didn't ran to it.
  const end = page.nextOffset ?? page.totalCharacters
  const partial = page.offset > 0 || page.nextOffset !== undefined
  return (
    <div className="mt-2 min-w-0">
      <PageTitle url={page.url} title={page.title || siteOf(page.url)} />
      {partial && (
        <p className="mt-0.5 text-caption text-muted tabular-nums">
          Characters {numbers.format(page.offset + 1)}–{numbers.format(end)} of{' '}
          {numbers.format(page.totalCharacters)}
        </p>
      )}
      <StepCode dir="auto">{page.content}</StepCode>
    </div>
  )
}

export const webFetch: ToolEntry = {
  label: 'Read a page',
  activity: 'Reading a page',
  glimpse: addressOf,
  View: WebFetchView,
}
