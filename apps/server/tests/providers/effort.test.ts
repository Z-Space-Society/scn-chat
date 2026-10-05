import { describe, expect, it, vi } from 'vitest'
import { mapEffort } from '../../src/providers/effort.ts'

describe('mapEffort', () => {
  it.each([
    [undefined, 'provider-default'],
    ['max', 'xhigh'],
  ])('maps %s to %s', (effort, expected) => {
    expect(mapEffort(effort, { warn: vi.fn() } as never)).toBe(expected)
  })

  it('maps an unknown value to the provider default and logs a warning', () => {
    const logger = { warn: vi.fn() }
    expect(mapEffort('ludicrous', logger as never)).toBe('provider-default')
    expect(logger.warn).toHaveBeenCalled()
  })
})
