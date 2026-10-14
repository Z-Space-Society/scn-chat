import { setupForTest } from '@scn-chat/plugin-api/testing'
import { describe, expect, it, vi } from 'vitest'
import plugin from '../src/index.ts'

const cocore = {
  id: 'cocore',
  name: 'co/core',
  baseURL: 'https://cocore.dev/v1',
  apiKey: 'admin-key',
}

const completion = {
  id: 'c',
  object: 'chat.completion',
  created: 1,
  model: 'm',
  choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
}

/** Stream a reply made of the given content deltas, returning its reasoning and text. */
async function streamWith(instance: ReturnType<typeof plugin>, deltas: string[]) {
  const { providers } = await setupForTest(instance)
  const chunk = (content: string) =>
    `data: ${JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`
  const body = `${deltas.map(chunk).join('')}data: [DONE]\n\n`
  const fetch = vi.fn(
    async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
  )
  const model = providers[0]!.createModel({
    modelId: 'qwen3',
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  const { stream } = await model.doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  } as never)
  const streamed = { reasoning: '', text: '' }
  for await (const part of stream as unknown as AsyncIterable<{ type: string; delta?: string }>) {
    if (part.type === 'reasoning-delta') streamed.reasoning += part.delta
    if (part.type === 'text-delta') streamed.text += part.delta
  }
  return streamed
}

describe('openai-compatible plugin', () => {
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
    const fetch = vi.fn(async () => Response.json(completion))
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

  it('sends the session header and user agent the admin set', async () => {
    const { providers } = await setupForTest(
      plugin({ ...cocore, sessionHeader: 'x-opencode-session', userAgent: 'scn-chat/1.0' }),
    )
    const fetch = vi.fn(async () => Response.json(completion))
    const model = providers[0]!.createModel({
      modelId: 'kimi',
      session: 'abc123',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as never)
    const headers = new Headers(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    )
    expect(headers.get('x-opencode-session')).toBe('abc123')
    expect(headers.get('user-agent')).toMatch(/^scn-chat\/1\.0/)
  })

  it('sends no session header when the admin set none', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    const fetch = vi.fn(async () => Response.json(completion))
    const model = providers[0]!.createModel({
      modelId: 'kimi',
      session: 'abc123',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as never)
    const headers = new Headers(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    )
    expect([...headers.keys()].some((name) => name.includes('session'))).toBe(false)
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

  it('sends the user agent the admin set, and a session of its own, with the model list', async () => {
    const { providers } = await setupForTest(
      plugin({ ...cocore, sessionHeader: 'x-opencode-session', userAgent: 'scn-chat/1.0' }),
    )
    const fetch = vi.fn(async () => Response.json({ data: [{ id: 'llama-3' }] }))
    await providers[0]!.listModels!({ fetch: fetch as unknown as typeof globalThis.fetch })
    const headers = new Headers(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    )
    expect(headers.get('user-agent')).toBe('scn-chat/1.0')
    expect(headers.get('x-opencode-session')).toMatch(/^[0-9a-f]{32}$/)
  })

  it('streams reasoning in think tags as reasoning, apart from the text', async () => {
    const streamed = await streamWith(plugin(cocore), ['<think>Plan', ' it.</think>', 'Hi'])
    expect(streamed).toEqual({ reasoning: 'Plan it.', text: 'Hi' })
  })

  it('treats a reply up to the closing tag as reasoning when replies start inside it', async () => {
    const streamed = await streamWith(plugin({ ...cocore, startWithReasoning: true }), [
      'Plan it.',
      '</think>Hi',
    ])
    expect(streamed).toEqual({ reasoning: 'Plan it.', text: 'Hi' })
  })

  it('separates reasoning in think tags from the text of a whole reply', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    const content = '<think>Plan it.</think>Hi'
    const fetch = vi.fn(async () =>
      Response.json({
        ...completion,
        choices: [{ ...completion.choices[0], message: { role: 'assistant', content } }],
      }),
    )
    const model = providers[0]!.createModel({
      modelId: 'qwen3',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    } as never)
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'reasoning', text: 'Plan it.' }),
      expect.objectContaining({ type: 'text', text: 'Hi' }),
    ])
  })

  it('fails without a base URL, before fetching', async () => {
    const { providers } = await setupForTest(plugin({ id: 'x', name: 'X' }))
    const fetch = vi.fn()
    expect(() => providers[0]!.createModel({ modelId: 'm' })).toThrow()
    await expect(
      providers[0]!.listModels!({ fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails on a model list that is not OpenAI-shaped', async () => {
    const { providers } = await setupForTest(plugin(cocore))
    const fetch = vi.fn(async () => Response.json({ models: [{ name: 'llama-3' }] }))
    await expect(
      providers[0]!.listModels!({ fetch: fetch as unknown as typeof globalThis.fetch }),
    ).rejects.toThrow()
  })
})
