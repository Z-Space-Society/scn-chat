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
          candidates: [
            { content: { parts: [{ text: 'hi' }], role: 'model' }, finishReason: 'STOP' },
          ],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
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
  return new Headers(init.headers).get('x-goog-api-key')
}

describe('google plugin', () => {
  it('uses the user key over the admin key', async () => {
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    expect(await keyUsed(providers[0]!, 'user-key')).toBe('user-key')
  })
})

describe('google listModels', () => {
  it('lists the models that generate content, with the admin key', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        models: [
          {
            name: 'models/gemini-3-pro',
            displayName: 'Gemini 3 Pro',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
        ],
      }),
    )
    const { providers } = await setupForTest(plugin({ apiKey: 'admin-key' }))
    const models = await providers[0]?.listModels?.({ fetch: fetch as never })
    expect(models).toEqual([
      {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        capabilities: { vision: false, reasoning: false, tools: false },
      },
    ])
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('x-goog-api-key')).toBe('admin-key')
  })

  it('fails without a key, before fetching', async () => {
    const fetch = vi.fn()
    const { providers } = await setupForTest(plugin())
    await expect(providers[0]?.listModels?.({ fetch: fetch as never })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
