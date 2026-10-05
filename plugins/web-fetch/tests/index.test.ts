import type { Ingester, Tool } from '@scn-chat/plugin-api'
import { setupForTest, toolContextForTest } from '@scn-chat/plugin-api/testing'
import { describe, expect, it, vi } from 'vitest'
import webFetch, { FetchError, optionsSchema } from '../src/index.ts'

type Routes = Record<string, () => Response>

/** A fetch that answers from the routes and records every request. */
function fakeFetch(routes: Routes) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const route = routes[String(url)]
    if (!route) throw new TypeError('fetch failed')
    return route()
  })
}

const html = (body: string, title = 'Page') =>
  new Response(`<html><head><title>${title}</title></head><body>${body}</body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } })

const pdfIngester: Ingester = {
  id: 'pdf',
  accepts: ['application/pdf'],
  method: 'text',
  ingest: async ({ bytes }) => ({ text: `pdf text (${bytes.length} bytes)` }),
}

async function setup(options: Parameters<typeof webFetch>[0] = {}, routes: Routes = {}) {
  const { tools } = await setupForTest(webFetch(options), {
    ingesters: [pdfIngester],
    app: { name: 'SCN Chat', publicUrl: 'https://chat.example' },
  })
  const tool = tools[0] as Tool<unknown>
  const fetch = fakeFetch(routes)
  const { context, citations } = toolContextForTest({ fetch: fetch as typeof globalThis.fetch })
  const run = (input: { url: string; offset?: number }) =>
    tool.run(input, context) as Promise<Record<string, unknown>>
  return { tool, fetch, run, citations }
}

describe('web-fetch plugin', () => {
  it('marks its output untrusted', async () => {
    const { tool } = await setup()
    expect(tool.untrusted).toBe(true)
  })

  it('fails options with domain entries that are not bare hostnames', () => {
    expect(optionsSchema.safeParse({ denyDomains: ['https://example.com'] }).success).toBe(false)
    expect(optionsSchema.safeParse({ allowDomains: ['Example.com/docs'] }).success).toBe(false)
  })
})

describe('web_fetch', () => {
  it('returns the title and Markdown of an HTML page and cites it', async () => {
    const { run, citations } = await setup(
      {},
      {
        'https://example.com/a': () =>
          html('<article><h1>Hello</h1><p>World</p></article>', 'Greeting'),
      },
    )
    const result = await run({ url: 'https://example.com/a' })
    expect(result).toMatchObject({ url: 'https://example.com/a', title: 'Greeting', offset: 0 })
    expect(result.content).toContain('World')
    expect(result).not.toHaveProperty('nextOffset')
    expect(citations).toEqual([{ url: 'https://example.com/a', title: 'Greeting' }])
  })

  it('returns plain text and JSON as text', async () => {
    const { run } = await setup(
      {},
      {
        'https://example.com/a.txt': () =>
          new Response('line one\nline two', { headers: { 'content-type': 'text/plain' } }),
        'https://example.com/a.json': () => Response.json({ ok: true }),
      },
    )
    expect((await run({ url: 'https://example.com/a.txt' })).content).toBe('line one\nline two')
    expect((await run({ url: 'https://example.com/a.json' })).content).toBe('{"ok":true}')
  })

  it('returns a PDF as the text from the ingester that accepts it', async () => {
    const { run } = await setup(
      {},
      {
        'https://example.com/a.pdf': () =>
          new Response(new Uint8Array(12), { headers: { 'content-type': 'application/pdf' } }),
      },
    )
    expect((await run({ url: 'https://example.com/a.pdf' })).content).toBe('pdf text (12 bytes)')
  })

  it('refuses a type no ingester accepts before reading its body', async () => {
    let pulled = false
    const body = new ReadableStream(
      {
        pull: (controller) => {
          pulled = true
          controller.enqueue(new Uint8Array(1))
        },
      },
      { highWaterMark: 0 },
    )
    const { run } = await setup(
      {},
      {
        'https://example.com/a.bin': () =>
          new Response(body, { headers: { 'content-type': 'application/octet-stream' } }),
      },
    )
    await expect(run({ url: 'https://example.com/a.bin' })).rejects.toThrow(
      'application/octet-stream',
    )
    expect(pulled).toBe(false)
  })

  it('refuses a file over maxFileBytes', async () => {
    const { run } = await setup(
      { maxFileBytes: 10 },
      {
        'https://example.com/a.pdf': () =>
          new Response(new Uint8Array(11), { headers: { 'content-type': 'application/pdf' } }),
      },
    )
    await expect(run({ url: 'https://example.com/a.pdf' })).rejects.toBeInstanceOf(FetchError)
  })

  it('stops reading a page body at maxBytes', async () => {
    const { run } = await setup(
      { maxBytes: 10 },
      {
        'https://example.com/a.txt': () =>
          new Response('a'.repeat(100), { headers: { 'content-type': 'text/plain' } }),
      },
    )
    expect((await run({ url: 'https://example.com/a.txt' })).content).toBe('a'.repeat(10))
  })

  it('reports an HTTP error status', async () => {
    const { run } = await setup(
      {},
      { 'https://example.com/gone': () => new Response('missing', { status: 404 }) },
    )
    await expect(run({ url: 'https://example.com/gone' })).rejects.toThrow('404')
  })
})

describe('web_fetch paging', () => {
  const lines = Array.from(
    { length: 60 },
    (_, i) => `line ${String(i).padStart(2, '0')} ${'x'.repeat(40)}`,
  )
  const text = lines.join('\n')
  const routes = {
    'https://example.com/long.txt': () =>
      new Response(text, { headers: { 'content-type': 'text/plain' } }),
  }

  it('serves long text in parts that end on a line break, the last without nextOffset', async () => {
    const { run } = await setup({ maxCharacters: 1000 }, routes)
    const first = await run({ url: 'https://example.com/long.txt' })
    expect((first.content as string).endsWith('\n')).toBe(true)
    expect(first.totalCharacters).toBe(text.length)
    let offset = first.nextOffset as number | undefined
    let joined = first.content as string
    while (offset !== undefined) {
      const next = await run({ url: 'https://example.com/long.txt', offset })
      joined += next.content as string
      offset = next.nextOffset as number | undefined
    }
    expect(joined).toBe(text)
  })

  it('serves later parts from the turn cache without downloading again', async () => {
    const { run, fetch } = await setup({ maxCharacters: 1000 }, routes)
    const first = await run({ url: 'https://example.com/long.txt' })
    await run({ url: 'https://example.com/long.txt', offset: first.nextOffset as number })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('reports an offset past the end', async () => {
    const { run } = await setup({ maxCharacters: 1000 }, routes)
    await expect(
      run({ url: 'https://example.com/long.txt', offset: text.length + 5 }),
    ).rejects.toBeInstanceOf(FetchError)
  })
})

describe('web_fetch domain lists and redirects', () => {
  it('refuses non-HTTP URLs and denied domains without fetching', async () => {
    const { run, fetch } = await setup({ denyDomains: ['example.com'] })
    await expect(run({ url: 'file:///etc/passwd' })).rejects.toBeInstanceOf(FetchError)
    await expect(run({ url: 'https://docs.example.com/a' })).rejects.toBeInstanceOf(FetchError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches only allowed domains and their subdomains when there is an allow list', async () => {
    const { run, fetch } = await setup(
      { allowDomains: ['example.com'] },
      { 'https://docs.example.com/a': () => html('<p>Docs</p>') },
    )
    expect((await run({ url: 'https://docs.example.com/a' })).content).toContain('Docs')
    await expect(run({ url: 'https://other.org/a' })).rejects.toBeInstanceOf(FetchError)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('follows a redirect and cites the final URL', async () => {
    const { run, citations } = await setup(
      {},
      {
        'https://example.com/old': () => redirect('/new'),
        'https://example.com/new': () => html('<p>Moved here</p>', 'New'),
      },
    )
    expect((await run({ url: 'https://example.com/old' })).url).toBe('https://example.com/new')
    expect(citations).toEqual([{ url: 'https://example.com/new', title: 'New' }])
  })

  it('refuses a redirect to a denied domain', async () => {
    const { run, fetch } = await setup(
      { denyDomains: ['evil.example'] },
      { 'https://example.com/old': () => redirect('https://evil.example/') },
    )
    await expect(run({ url: 'https://example.com/old' })).rejects.toBeInstanceOf(FetchError)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('stops after 5 redirects', async () => {
    const routes: Routes = {}
    for (let i = 0; i < 7; i++) routes[`https://example.com/${i}`] = () => redirect(`/${i + 1}`)
    const { run, fetch } = await setup({}, routes)
    await expect(run({ url: 'https://example.com/0' })).rejects.toBeInstanceOf(FetchError)
    expect(fetch).toHaveBeenCalledTimes(6)
  })
})
