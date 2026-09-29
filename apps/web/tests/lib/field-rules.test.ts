import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRule, type FieldRule } from '../../src/lib/field-rules.ts'

const rule = (
  effect: FieldRule['effect'],
  schema: Record<string, unknown>,
  extra: Partial<FieldRule['condition']> = {},
): FieldRule => ({ effect, condition: { scope: '#/properties/engine', schema, ...extra } })

afterEach(() => vi.restoreAllMocks())

describe('applyRule', () => {
  it('shows and enables a field without a rule', () => {
    expect(applyRule(undefined, {})).toEqual({ visible: true, enabled: true })
  })

  it('shows a field with SHOW only while its condition holds', () => {
    const show = rule('SHOW', { enum: ['kagi', 'brave'] })
    expect(applyRule(show, { engine: 'kagi' }).visible).toBe(true)
    expect(applyRule(show, { engine: 'default' }).visible).toBe(false)
  })

  it('hides a field with HIDE while its condition holds', () => {
    expect(applyRule(rule('HIDE', { const: 'default' }), { engine: 'default' }).visible).toBe(false)
  })

  it('enables a field with ENABLE only while its condition holds, and disables with DISABLE', () => {
    expect(applyRule(rule('ENABLE', { const: 'kagi' }), { engine: 'brave' })).toEqual({
      visible: true,
      enabled: false,
    })
    expect(applyRule(rule('DISABLE', { const: 'kagi' }), { engine: 'kagi' }).enabled).toBe(false)
  })

  it('negates a condition with not', () => {
    const show = rule('SHOW', { not: { const: 'default' } })
    expect(applyRule(show, { engine: 'kagi' }).visible).toBe(true)
    expect(applyRule(show, { engine: 'default' }).visible).toBe(false)
  })

  it('tests a string length with minLength', () => {
    const show = rule('SHOW', { minLength: 1 })
    expect(applyRule(show, { engine: 'x' }).visible).toBe(true)
    expect(applyRule(show, { engine: '' }).visible).toBe(false)
  })

  it('treats an undefined value as passing unless failWhenUndefined is set', () => {
    expect(applyRule(rule('SHOW', { const: 'kagi' }), {}).visible).toBe(true)
    expect(
      applyRule(rule('SHOW', { const: 'kagi' }, { failWhenUndefined: true }), {}).visible,
    ).toBe(false)
  })

  it('ignores a rule with an unsupported keyword, scope, or effect, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shown = { visible: true, enabled: true }
    expect(applyRule(rule('SHOW', { pattern: '^k' }), { engine: 'brave' })).toEqual(shown)
    expect(
      applyRule(
        { effect: 'SHOW', condition: { scope: '#/properties/a/properties/b', schema: {} } },
        {},
      ),
    ).toEqual(shown)
    expect(applyRule({ ...rule('SHOW', {}), effect: 'BLINK' as never }, { engine: 'x' })).toEqual(
      shown,
    )
    expect(warn).toHaveBeenCalledTimes(3)
  })
})
