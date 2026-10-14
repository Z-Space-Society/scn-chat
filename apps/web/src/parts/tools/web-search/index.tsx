import { clip } from '../../steps.ts'
import type { ToolEntry, ToolViewProps } from '../../types.ts'
import { DefaultToolView } from '../default/index.tsx'
import { parseJson } from '../json.ts'
import { PageTitle, ToolNote } from '../ui.tsx'

/** The query a search asked for, or nothing when its input isn't one. */
function queryOf(input: string): string {
  const value = parseJson(input) as { query?: unknown } | undefined
  return typeof value?.query === 'string' ? clip(value.query.replace(/\s+/g, ' '), 80) : ''
}

interface SearchResult {
  title: string
  url: string
  snippet?: string
}

const isResult = (value: unknown): value is SearchResult => {
  const item = value as Partial<SearchResult> | null
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.title === 'string' &&
    typeof item.url === 'string' &&
    (item.snippet === undefined || typeof item.snippet === 'string')
  )
}

/** The results the plugin returned, as `{ results: [{ title, url, snippet }] }`, or undefined. */
function resultsOf(output: unknown): SearchResult[] | undefined {
  const value = parseJson(output) as { results?: unknown } | undefined
  const results = value?.results
  return Array.isArray(results) && results.every(isResult) ? results : undefined
}

/**
 * A search's results, each its title linking to its page, its site, and its snippet as plain text.
 * Anything it can't read, such as an error or output kept in a blob, shows as the default view.
 */
function WebSearchView(props: ToolViewProps) {
  if (props.status === 'running') return <ToolNote>Searching…</ToolNote>
  const readable = props.status === 'done' && !props.result?.outputBlob
  const results = readable ? resultsOf(props.result?.output) : undefined
  if (!results) return <DefaultToolView {...props} />
  if (results.length === 0) return <ToolNote>No results.</ToolNote>
  return (
    <ul className="mt-2 mb-1 flex flex-col gap-2.5">
      {results.map((result, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: results have no identity beyond their place, and a URL can repeat.
        <li key={i} className="min-w-0">
          <PageTitle url={result.url} title={result.title} />
          {result.snippet && (
            <p className="mt-0.5 line-clamp-2 text-muted" dir="auto">
              {result.snippet}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export const webSearch: ToolEntry = {
  label: 'Searched the web',
  activity: 'Searching the web',
  glimpse: queryOf,
  View: WebSearchView,
}
