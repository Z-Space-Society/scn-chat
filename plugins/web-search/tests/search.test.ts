import { describe, expect, it, vi } from 'vitest'
import { type SearchEngine, SearchError } from '../src/engines/types.ts'
import { runSearch } from '../src/search.ts'

const engine: SearchEngine = {
  id: 'fake',
  name: 'Fake',
  needsKey: true,
  needsBaseURL: false,
  operators: [],
  request: ({ query, apiKey }) => ({
    url: `https://search.example/?q=${query}`,
    init: { headers: { authorization: `Key ${apiKey}` } },
  }),
  parse: (body) => JSON.parse(body).results,
}

function search(response: () => Response | Promise<Response>) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response())
  const run = runSearch(
    engine,
    { query: 'tiles', count: 5, apiKey: 'sk-secret-key' },
    {
      fetch: fetch as unknown as typeof globalThis.fetch,
      signal: new AbortController().signal,
      userAgent: 'SCN Chat (+https://chat.example)',
    },
  )
  return { run, fetch }
}

const results = (items: object[]) => () => Response.json({ results: items })

describe('runSearch', () => {
  it("sends the engine's request with the app's user agent", async () => {
    const { run, fetch } = search(results([]))
    await run
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://search.example/?q=tiles')
    expect(init?.headers).toEqual({
      'user-agent': 'SCN Chat (+https://chat.example)',
      authorization: 'Key sk-secret-key',
    })
  })

  it('strips HTML from titles and snippets and cuts snippets to 500 characters', async () => {
    const { run } = search(
      results([
        {
          title: 'Tiles &amp; <b>grout</b>',
          url: 'https://example.com',
          snippet: `<em>${'a'.repeat(600)}</em>`,
        },
      ]),
    )
    const [result] = await run
    expect(result?.title).toBe('Tiles & grout')
    expect(result?.snippet).toBe('a'.repeat(500))
  })

  it('turns an error status into a SearchError naming the engine', async () => {
    const error = await search(() => new Response('nope', { status: 500 })).run.catch(
      (err: Error) => err,
    )
    expect(error).toBeInstanceOf(SearchError)
    expect(String(error)).toContain('Fake')
  })

  it("uses the engine's own message for a status when it has one", async () => {
    const custom = { ...engine, describeError: () => 'Custom message' }
    const run = runSearch(
      custom,
      { query: 'q', count: 1 },
      {
        fetch: (async () =>
          new Response('', { status: 403 })) as unknown as typeof globalThis.fetch,
        signal: new AbortController().signal,
        userAgent: 'ua',
      },
    )
    await expect(run).rejects.toThrow('Custom message')
  })

  it('reports a response it cannot read as a SearchError', async () => {
    await expect(search(() => new Response('<html>not json')).run).rejects.toBeInstanceOf(
      SearchError,
    )
  })

  it('reports a network failure without the key', async () => {
    const { run } = search(() => {
      throw new TypeError('fetch failed for key sk-secret-key')
    })
    const error = await run.catch((err: Error) => err)
    expect(error).toBeInstanceOf(SearchError)
    expect(String(error)).not.toContain('sk-secret-key')
  })
})
