import { describe, expect, it, vi } from 'vitest'
import { httpApi, Unauthorized } from '../../src/store/http-api.ts'

describe('httpApi', () => {
  it('requests changes since a revision', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ conversations: [], deleted: [], rev: 'r2', full: false }),
    )
    await httpApi(fetch as unknown as typeof globalThis.fetch).fetchIndex('r1')
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('/api/conversations?since=r1')
  })

  it('reads keys for the index and for a conversation', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ keys: [{ collection: 'c', rkey: 'r', cid: 'x' }] }),
    )
    const api = httpApi(fetch as unknown as typeof globalThis.fetch)
    expect(await api.fetchKeys()).toHaveLength(1)
    await api.fetchKeys('3abc')
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toBe('/api/conversations/3abc/keys')
  })

  it('throws Unauthorized on a 401', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 401 }))
    await expect(
      httpApi(fetch as unknown as typeof globalThis.fetch).fetchIndex(),
    ).rejects.toBeInstanceOf(Unauthorized)
  })

  it('includes the server message when a request fails', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: 'NotFound', message: 'Space not found' }, { status: 404 }),
    )
    await expect(
      httpApi(fetch as unknown as typeof globalThis.fetch).fetchConversation('3abc'),
    ).rejects.toThrow('Space not found')
  })
})
