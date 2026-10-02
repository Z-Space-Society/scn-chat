import type { Ingester } from '@scn-chat/plugin-api'
import { describe, expect, it } from 'vitest'
import {
  DuplicateRegistrationError,
  IngesterRegistry,
  Registry,
} from '../../src/plugins/registry.ts'

const ingester = (id: string, accepts: string[], priority?: number): Ingester => ({
  id,
  accepts,
  priority,
  method: 'text',
  ingest: async () => ({ text: id }),
})

describe('Registry', () => {
  it('refuses a duplicate key, naming the plugin that already has it', () => {
    const registry = new Registry<{ id: string }>('provider', (item) => item.id)
    registry.register({ id: 'anthropic' }, 'plugin-a')
    const again = () => registry.register({ id: 'anthropic' }, 'plugin-b')
    expect(again).toThrow(DuplicateRegistrationError)
    expect(again).toThrow('plugin-a')
  })
})

describe('IngesterRegistry.match', () => {
  it('picks the highest priority ingester that accepts the type', () => {
    const registry = new IngesterRegistry()
    registry.register(ingester('pdf-text', ['application/pdf']), 'a')
    registry.register(ingester('ocr', ['application/pdf', 'image/*'], 10), 'b')
    expect(registry.match('application/pdf')?.id).toBe('ocr')
  })

  it('matches wildcard types', () => {
    const registry = new IngesterRegistry()
    registry.register(ingester('ocr', ['image/*']), 'a')
    expect(registry.match('image/png')?.id).toBe('ocr')
  })
})
