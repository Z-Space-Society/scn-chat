import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import type { ModelCatalog } from '../../src/providers/catalog.ts'
import { createGenerateText } from '../../src/providers/generate-text.ts'

const titled = async () =>
  ({
    content: [{ type: 'text', text: 'A short title' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: { inputTokens: { total: 1 }, outputTokens: { total: 3 } },
    warnings: [],
  }) as never

function setup(reasoning: boolean, doGenerate: () => Promise<never> = titled) {
  const model = new MockLanguageModelV4({ doGenerate })
  const catalog = {
    resolve: vi.fn(async () => ({
      ref: { provider: 'fake', id: 'm' },
      model,
      provider: { id: 'fake', name: 'Fake', providerOptions: undefined },
      capabilities: { vision: false, reasoning, tools: false },
      source: 'admin',
    })),
  } as unknown as ModelCatalog
  return { model, catalog, generate: createGenerateText(catalog, { warn: vi.fn() } as never) }
}

const request = {
  user: 'did:plc:alice',
  model: { provider: 'fake', id: 'm' },
  prompt: 'Title this',
}

describe('createGenerateText', () => {
  it('resolves the model for the user and returns the text and finish reason', async () => {
    const { catalog, generate } = setup(false)
    expect(await generate(request)).toEqual({ text: 'A short title', finishReason: 'stop' })
    expect(catalog.resolve).toHaveBeenCalledWith(
      'did:plc:alice',
      { provider: 'fake', id: 'm' },
      undefined,
    )
  })

  it("resolves the model for the request's conversation", async () => {
    const { catalog, generate } = setup(false)
    await generate({ ...request, conversation: 'at://did:plc:alice/chat/abc' })
    expect(catalog.resolve).toHaveBeenCalledWith(
      'did:plc:alice',
      { provider: 'fake', id: 'm' },
      'at://did:plc:alice/chat/abc',
    )
  })

  it('passes the requested effort to a reasoning model', async () => {
    const { model, generate } = setup(true)
    await generate({ ...request, effort: 'none' })
    expect(model.doGenerateCalls[0]?.reasoning).toBe('none')
  })

  it('sends no reasoning setting to a model without reasoning', async () => {
    const { model, generate } = setup(false)
    await generate({ ...request, effort: 'none' })
    expect(model.doGenerateCalls[0]?.reasoning).toBeUndefined()
  })

  it('gives up at once on a key that is out of credit', async () => {
    const message = 'You exceeded your current quota, please check your plan and billing details.'
    const { model, generate } = setup(false, async () => {
      throw new APICallError({
        message,
        url: 'https://provider.test/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { 'retry-after-ms': '0' },
        responseBody: JSON.stringify({
          error: { message, type: 'insufficient_quota', param: null, code: 'insufficient_quota' },
        }),
      })
    })
    await expect(generate(request)).rejects.toBeInstanceOf(APICallError)
    expect(model.doGenerateCalls).toHaveLength(1)
  })
})
