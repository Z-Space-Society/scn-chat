import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'
import type { ModelCatalog } from '../../src/providers/catalog.ts'
import { createGenerateText } from '../../src/providers/generate-text.ts'

function setup(reasoning: boolean) {
  const model = new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        content: [{ type: 'text', text: 'A short title' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 3 } },
        warnings: [],
      }) as never,
  })
  const catalog = {
    resolve: vi.fn(async () => ({
      model,
      provider: { providerOptions: undefined },
      capabilities: { reasoning },
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
    expect(catalog.resolve).toHaveBeenCalledWith('did:plc:alice', { provider: 'fake', id: 'm' })
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
})
