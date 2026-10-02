import { setupForTest } from '@scn-chat/plugin-api/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plugin from '../src/index.ts'

afterEach(() => vi.unstubAllGlobals())

async function keyUsed(
  provider: Awaited<ReturnType<typeof setupForTest>>['providers'][number],
  apiKey?: string,
) {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: 'r',
          created_at: 1,
          model: 'gpt',
          output: [
            {
              type: 'message',
              id: 'm',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'hi', annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetch)
  const model = provider.createModel({ modelId: 'test-model', apiKey })
  await model.doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  } as never)
  const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
  return new Headers(init.headers).get('authorization')
}

describe('openai plugin', () => {
  it('uses the user key over the admin key', async () => {
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(await keyUsed(providers[0]!, 'user-key')).toBe('Bearer user-key')
  })
})

describe('openai listModels', () => {
  it('lists models with the admin key', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ data: [{ id: 'gpt-x' }] }),
    )
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(await providers[0]?.listModels?.({ fetch: fetch as never })).toEqual([
      {
        id: 'gpt-x',
        name: 'gpt-x',
        capabilities: { vision: false, reasoning: false, tools: false },
      },
    ])
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer admin-key',
    )
  })

  it('reports a response that is not a model list', async () => {
    const fetch = vi.fn(async () => Response.json({ nope: true }))
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    await expect(providers[0]?.listModels?.({ fetch: fetch as never })).rejects.toThrow()
  })
})
