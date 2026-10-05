import type { Tool } from '@scn-chat/plugin-api'
import { setupForTest, toolContextForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchEngine } from '../src/engines/types.ts'
import webSearch, { createWebSearch, optionsSchema, SearchError } from '../src/index.ts'

const tavilyBody = (urls: string[]) =>
  Response.json({ results: urls.map((url) => ({ title: `Title ${url}`, url, content: 'text' })) })

type Options = Parameters<typeof webSearch>[0]

/** Set up the plugin on DuckDuckGo unless the options name another engine. */
async function setup(
  options: Partial<Options> = {},
  user: Record<string, unknown> = { engine: 'default', apiKey: '', baseURL: '' },
  plugin = webSearch({ engine: 'duckduckgo', ...options } as Options),
  roles = ['user'],
) {
  const { tools } = await setupForTest(plugin, { userSettings: () => user })
  const contextFetch = vi.fn(async () => Response.json({ results: [] }))
  const { context, citations } = toolContextForTest({
    fetch: contextFetch as unknown as typeof globalThis.fetch,
    roles,
  })
  const tool = tools[0] as Tool<unknown>
  return {
    tool,
    plugin,
    contextFetch,
    citations,
    run: (query: string) => tool.run({ query }, context),
  }
}

/** Replace the plain fetch used for admin-configured addresses. */
function stubGlobalFetch(response: () => Response) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => response())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('web-search options', () => {
  it('requires a key or base URL for engines that need one', () => {
    expect(optionsSchema.safeParse({ engine: 'brave' }).error?.issues[0]?.path).toEqual(['apiKey'])
    expect(optionsSchema.safeParse({ engine: 'searxng' }).error?.issues[0]?.path).toEqual([
      'baseURL',
    ])
  })

  it('derives the engine choices from the engine list, so a new engine needs no other change', async () => {
    const fake: SearchEngine = {
      id: 'fake',
      name: 'Fake',
      needsKey: true,
      needsBaseURL: false,
      operators: ['near:'],
      request: () => ({ url: 'https://fake.example/' }),
      parse: () => [{ title: 'Found', url: 'https://found.example', snippet: '' }],
    }
    const built = createWebSearch([fake])
    expect(built.optionsSchema.safeParse({ engine: 'fake' }).success).toBe(false)
    expect(built.optionsSchema.safeParse({ engine: 'duckduckgo' }).success).toBe(false)
    stubGlobalFetch(() => new Response('ok'))
    const { tool, run } = await setup(
      undefined,
      undefined,
      built.webSearch({ engine: 'fake', apiKey: 'k' }),
    )
    expect(tool.description).toContain('near:')
    expect(await run('q')).toEqual({
      results: [{ title: 'Found', url: 'https://found.example', snippet: '' }],
    })
  })
})

describe('web-search plugin', () => {
  it('marks its results untrusted', async () => {
    const { tool } = await setup()
    expect(tool.untrusted).toBe(true)
  })

  it('has no user settings when user engines are off, and uses the admin engine', async () => {
    const fetch = stubGlobalFetch(() => tavilyBody(['https://a.example']))
    const { plugin, run } = await setup(
      { engine: 'tavily', apiKey: 'admin-key', userEngines: false },
      { engine: 'kagi', apiKey: 'user-key', baseURL: '' },
    )
    expect(plugin.userSettings).toBeUndefined()
    await run('tiles')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.tavily.com/search')
  })
})

describe('web_search', () => {
  it("uses the admin's engine and key when the user picks the default", async () => {
    const fetch = stubGlobalFetch(() => tavilyBody(['https://a.example']))
    const { run } = await setup({ engine: 'tavily', apiKey: 'admin-key' })
    await run('tiles')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer admin-key' })
  })

  it("uses the user's engine and key when they pick their own", async () => {
    const fetch = stubGlobalFetch(() => Response.json({ data: [] }))
    const { run } = await setup(
      { engine: 'tavily', apiKey: 'admin-key' },
      { engine: 'kagi', apiKey: 'user-key', baseURL: '' },
    )
    await run('tiles')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bot user-key' })
  })

  it("fills a blank key with the admin's only when the user picked the admin's engine", async () => {
    const fetch = stubGlobalFetch(() => tavilyBody([]))
    const same = await setup(
      { engine: 'tavily', apiKey: 'admin-key' },
      { engine: 'tavily', apiKey: '', baseURL: '' },
    )
    await same.run('tiles')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer admin-key' })
    const other = await setup(
      { engine: 'tavily', apiKey: 'admin-key' },
      { engine: 'brave', apiKey: '', baseURL: '' },
    )
    await expect(other.run('tiles')).rejects.toBeInstanceOf(SearchError)
  })

  it("reaches a user's SearXNG through the guarded fetch", async () => {
    const fetch = stubGlobalFetch(() => Response.json({ results: [] }))
    const { run, contextFetch } = await setup(
      {},
      { engine: 'searxng', apiKey: '', baseURL: 'https://searx.example' },
    )
    await run('tiles')
    expect(contextFetch).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("reaches the admin's SearXNG through the plain fetch", async () => {
    const fetch = stubGlobalFetch(() => Response.json({ results: [] }))
    const { run, contextFetch } = await setup({
      engine: 'searxng',
      baseURL: 'http://searx.internal',
    })
    await run('tiles')
    expect(fetch.mock.calls[0]?.[0]).toBe('http://searx.internal/search?q=tiles&format=json')
    expect(contextFetch).not.toHaveBeenCalled()
  })

  it('cuts results to maxResults and cites each one', async () => {
    const urls = ['https://a.example', 'https://b.example', 'https://c.example']
    stubGlobalFetch(() => tavilyBody(urls))
    const { run, citations } = await setup({ engine: 'tavily', apiKey: 'k', maxResults: 2 })
    const output = (await run('tiles')) as { results: unknown[] }
    expect(output.results).toHaveLength(2)
    expect(citations).toEqual([
      { url: 'https://a.example', title: 'Title https://a.example' },
      { url: 'https://b.example', title: 'Title https://b.example' },
    ])
  })
})

describe('web_search admin engine roles', () => {
  const tavily = { engine: 'tavily' as const, apiKey: 'admin-key', adminEngineRoles: ['member'] }

  it("searches with the admin's engine for a user in its roles", async () => {
    const fetch = stubGlobalFetch(() => tavilyBody([]))
    const { run } = await setup(tavily, undefined, undefined, ['user', 'member'])
    await run('tiles')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer admin-key' })
  })

  it('refuses a user outside its roles without an engine of their own, without searching', async () => {
    const fetch = stubGlobalFetch(() => tavilyBody([]))
    await expect((await setup(tavily)).run('tiles')).rejects.toBeInstanceOf(SearchError)
    const enginesOff = await setup({ ...tavily, userEngines: false })
    await expect(enginesOff.run('tiles')).rejects.toBeInstanceOf(SearchError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("never fills a blank with the admin's key for a user outside its roles", async () => {
    stubGlobalFetch(() => tavilyBody([]))
    const { run } = await setup(tavily, { engine: 'tavily', apiKey: '', baseURL: '' })
    await expect(run('tiles')).rejects.toBeInstanceOf(SearchError)
  })

  it('lets a user outside its roles search with their own engine', async () => {
    const fetch = stubGlobalFetch(() => Response.json({ data: [] }))
    const { run } = await setup(tavily, { engine: 'kagi', apiKey: 'user-key', baseURL: '' })
    await run('tiles')
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bot user-key' })
  })
})
