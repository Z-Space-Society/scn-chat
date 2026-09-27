import type { ModelProvider } from '@scn-chat/plugin-api'
import { MockLanguageModelV4 } from 'ai/test'
import { vi } from 'vitest'

/** A provider whose models record how they were created. */
export function fakeProvider(overrides: Partial<ModelProvider> = {}) {
  const created: { modelId: string; apiKey?: string; baseURL?: string; fetch?: unknown }[] = []
  const provider: ModelProvider = {
    id: 'fake',
    name: 'Fake',
    hasAdminKey: true,
    userKeys: true,
    replay: 'replay',
    createModel: vi.fn((access) => {
      created.push(access)
      return new MockLanguageModelV4({ provider: overrides.id ?? 'fake', modelId: access.modelId })
    }),
    ...overrides,
  }
  return { provider, created }
}
