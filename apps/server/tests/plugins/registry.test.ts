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
  it('returns registered items by key', () => {
    const registry = new Registry<{ id: string }>('provider', (item) => item.id)
    registry.register({ id: 'anthropic' }, 'plugin-a')
    expect(registry.get('anthropic')).toEqual({ id: 'anthropic' })
    expect(registry.list()).toHaveLength(1)
  })

  it('refuses a duplicate key, naming both plugins', () => {
    const registry = new Registry<{ id: string }>('provider', (item) => item.id)
    registry.register({ id: 'anthropic' }, 'plugin-a')
    expect(() => registry.register({ id: 'anthropic' }, 'plugin-b')).toThrow(
      DuplicateRegistrationError,
    )
    expect(() => registry.register({ id: 'anthropic' }, 'plugin-b')).toThrow(
      /plugin-b.*anthropic.*plugin-a/,
    )
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

  it('returns nothing when no ingester accepts the type', () => {
    const registry = new IngesterRegistry()
    registry.register(ingester('pdf-text', ['application/pdf']), 'a')
    expect(registry.match('text/csv')).toBeUndefined()
  })
})
