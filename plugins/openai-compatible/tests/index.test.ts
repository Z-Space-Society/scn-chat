import { setupForTest } from '@scn-chat/plugin-api/testing'
import { describe, expect, it, vi } from 'vitest'
import plugin, { optionsSchema } from '../src/index.ts'

const cocore = {
  id: 'cocore',
  name: 'co/core',
  baseURL: 'https://cocore.dev/v1',
  apiKey: 'admin-key',
}

describe('openai-compatible plugin', () => {
  it('registers a provider under the configured ID that drops earlier reasoning', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    expect(providers).toMatchObject([
      {
        id: 'cocore',
        name: 'co/core',
        hasAdminKey: true,
        replay: 'drop',
        userEndpoints: false,
        allowPrivateNetworks: false,
      },
    ])
  })

  it('offers admin models for a keyless local server with only a base URL', async () => {
    const { providers } = await setupForTest(
      plugin({ id: 'ollama', name: 'Ollama', baseURL: 'http://localhost:11434/v1' }),
    )
    expect(providers[0]?.hasAdminKey).toBe(true)
  })

  it('can be listed several times with different IDs', async () => {
    expect(plugin(cocore).id).not.toBe(plugin({ ...cocore, id: 'ollama' }).id)
  })

  it('sends requests to a user endpoint through the given fetch', async () => {
    const { providers } = await setupForTest(
      plugin({ id: 'custom', name: 'Custom', userEndpoints: true }),
    )
    const fetch = vi.fn(async () =>
      Response.json({
        id: 'c',
        object: 'chat.completion',
        created: 1,
        model: 'm',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    )
    const model = providers[0]!.createModel({
      modelId: 'llama',
      apiKey: 'user-key',
      baseURL: 'https://my.host/v1',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as never)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://my.host/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer user-key')
  })

  it('lists models from the endpoint', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    const fetch = vi.fn(async () => Response.json({ data: [{ id: 'llama-3' }, { id: 'qwen' }] }))
    const models = await providers[0]!.listModels!({
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    expect(models.map((model) => model.id)).toEqual(['llama-3', 'qwen'])
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://cocore.dev/v1/models')
  })

  it('fails without a base URL', async () => {
    const { providers } = await setupForTest(plugin({ id: 'x', name: 'X' }))
    expect(() => providers[0]!.createModel({ modelId: 'm' })).toThrow(/no base URL/)
    await expect(providers[0]!.listModels!({})).rejects.toThrow(/no base URL/)
  })

  it('fails on a model list that is not OpenAI-shaped', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    const fetch = vi.fn(async () => Response.json({ models: [{ name: 'llama-3' }] }))
    await expect(
      providers[0]!.listModels!({ fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow(/OpenAI-style model list/)
  })
})

describe('openai-compatible optionsSchema', () => {
  it('accepts valid options', () => {
    expect(
      optionsSchema.safeParse({ id: 'cocore', name: 'co/core', baseURL: 'https://cocore.dev/v1' })
        .success,
    ).toBe(true)
  })

  it('rejects invalid or unknown options', () => {
    expect(optionsSchema.safeParse({ id: 'Bad ID', name: 'x' }).success).toBe(false)
  })
})
