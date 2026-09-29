import type { Tool } from '@scn-chat/plugin-api'
import { setupForTest, toolContextForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { SearchEngine } from '../src/engines/types.ts'
import webSearch, { createWebSearch, optionsSchema } from '../src/index.ts'

const tavilyBody = (urls: string[]) =>
  Response.json({ results: urls.map((url) => ({ title: `Title ${url}`, url, content: 'text' })) })

async function setup(
  options: Parameters<typeof webSearch>[0] = {},
  user: Record<string, unknown> = { engine: 'default', apiKey: '', baseURL: '' },
  plugin = webSearch(options),
) {
  const { tools } = await setupForTest(plugin, { userSettings: () => user })
  const contextFetch = vi.fn(async () => Response.json({ results: [] }))
  const { context, citations } = toolContextForTest({
    fetch: contextFetch as unknown as typeof globalThis.fetch,
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
  it('defaults to DuckDuckGo, off by default, switchable, with user engines', () => {
    expect(optionsSchema.parse({})).toMatchObject({
      engine: 'duckduckgo',
      enabledByDefault: false,
      userToggle: true,
      userEngines: true,
      maxResults: 5,
    })
  })

  it('fails for an engine that needs a key without one', () => {
    const result = optionsSchema.safeParse({ engine: 'brave' })
    expect(result.error?.issues[0]).toMatchObject({
      path: ['apiKey'],
      message: 'is required for Brave',
    })
  })

  it('fails for SearXNG without a base URL', () => {
    const result = optionsSchema.safeParse({ engine: 'searxng' })
    expect(result.error?.issues[0]).toMatchObject({ path: ['baseURL'] })
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
  it('registers web_search as untrusted, with the default and switch from the options', async () => {
    const { tool } = await setup({ enabledByDefault: true, userToggle: false })
    expect(tool).toMatchObject({
      name: 'web_search',
      defaultEnabled: true,
      userToggle: false,
      untrusted: true,
    })
  })

  it("lists the admin's engine's operators in the description", async () => {
    const { tool } = await setup({ engine: 'tavily', apiKey: 'k' })
    expect(tool.description).not.toContain('Supported operators')
    const ddg = await setup()
    expect(ddg.tool.description).toContain('Supported operators: site:example.com')
  })

  it('has user settings for the engine, key, and base URL', async () => {
    const { plugin } = await setup()
    expect(Object.keys(plugin.userSettings?.shape ?? {})).toEqual(['engine', 'apiKey', 'baseURL'])
  })

  it('shows the key field only for keyed engines and the base URL only for SearXNG', async () => {
    const { plugin } = await setup()
    const schema = z.toJSONSchema(plugin.userSettings as z.ZodObject) as {
      properties: Record<string, { rule?: unknown }>
    }
    const shownFor = (engines: string[]) => ({
      effect: 'SHOW',
      condition: { scope: '#/properties/engine', schema: { enum: engines } },
    })
    expect(schema.properties.apiKey?.rule).toEqual(shownFor(['brave', 'tavily', 'kagi']))
    expect(schema.properties.baseURL?.rule).toEqual(shownFor(['searxng']))
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
    await expect(other.run('tiles')).rejects.toThrow(
      'Add your Brave API key in the web search settings.',
    )
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
