import { parseHTML } from 'linkedom'
import { z } from 'zod'
import {
  type SearchEngine,
  SearchError,
  type SearchRequest,
  type SearchResult,
} from './engines/types.ts'

const SNIPPET_LENGTH = 500
const TIMEOUT_MS = 15_000

/** Text from a snippet that may hold HTML tags and entities, with whitespace collapsed. */
function plainText(html: string): string {
  const { document } = parseHTML('<!doctype html><html><body></body></html>')
  document.body.innerHTML = html
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function statusMessage(engine: SearchEngine, status: number): string {
  const custom = engine.describeError?.(status)
  if (custom) return custom
  if (status === 401 || status === 403) return `The ${engine.name} API key was rejected.`
  if (status === 429) return `${engine.name}'s rate limit was reached.`
  return `${engine.name} search failed (HTTP ${status}).`
}

/** Is this the guard refusing a private address, as thrown through fetch? */
const isPrivateNetworkRefusal = (err: unknown) =>
  err instanceof Error &&
  (err.name === 'PrivateNetworkError' ||
    (err.cause instanceof Error && err.cause.name === 'PrivateNetworkError'))

/** Run a search, turning every failure into a message naming the engine and never the key. */
export async function runSearch(
  engine: SearchEngine,
  search: SearchRequest,
  options: { fetch: typeof globalThis.fetch; signal: AbortSignal; userAgent: string },
): Promise<SearchResult[]> {
  const { url, init } = engine.request(search)
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)])
  const headers = { 'user-agent': options.userAgent, ...(init?.headers as Record<string, string>) }
  let res: Response
  try {
    res = await options.fetch(url, { ...init, headers, signal })
  } catch (err) {
    if (isPrivateNetworkRefusal(err))
      throw new SearchError(`The ${engine.name} address is not allowed.`)
    if (err instanceof DOMException && err.name === 'TimeoutError')
      throw new SearchError(`${engine.name} search timed out.`)
    if (err instanceof TypeError) throw new SearchError(`${engine.name} search failed.`)
    throw err
  }
  const body = await res.text()
  if (res.status !== 200) throw new SearchError(statusMessage(engine, res.status))
  let results: SearchResult[]
  try {
    results = engine.parse(body)
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof z.ZodError)
      throw new SearchError(`${engine.name} returned a response that could not be read.`)
    throw err
  }
  return results.slice(0, search.count).map((result) => ({
    title: plainText(result.title),
    url: result.url,
    snippet: plainText(result.snippet).slice(0, SNIPPET_LENGTH),
  }))
}
