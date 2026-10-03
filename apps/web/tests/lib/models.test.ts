import { describe, expect, it } from 'vitest'
import { fallbackModel, inheritedModel } from '../../src/lib/models.ts'

const smart = { provider: 'p', id: 'smart' }
const fast = { provider: 'p', id: 'fast' }
const admin = { provider: 'p', id: 'admin' }

const step = (rkey: string, record: Record<string, unknown>) => ({ message: { rkey, record } })
const user = (rkey: string) => step(rkey, { role: 'user' })
const reply = (rkey: string, model: object, status = 'complete') =>
  step(rkey, { role: 'assistant', status, model })

describe('inheritedModel', () => {
  const branch = [user('a'), reply('a.r0', smart), user('b'), reply('b.r0', fast), user('c')]

  it("takes the nearest completed reply's model at or above the parent", () => {
    expect(inheritedModel(branch, 'c')).toEqual(fast)
    expect(inheritedModel(branch, 'b')).toEqual(smart)
  })

  it('skips replies that did not complete', () => {
    const failed = [user('a'), reply('a.r0', smart), user('b'), reply('b.r0', fast, 'error')]
    expect(inheritedModel(failed, 'b.r0')).toEqual(smart)
  })

  it('has none above the first message, or for a parent off the branch', () => {
    expect(inheritedModel(branch, 'a')).toBeNull()
    expect(inheritedModel(branch, undefined)).toBeNull()
    expect(inheritedModel(branch, 'gone')).toBeNull()
  })
})

describe('fallbackModel', () => {
  const catalog = (defaultModel: typeof admin | null) => ({ models: [], defaultModel })

  it.each([
    ['the inherited model first', smart, { defaultModel: fast }, catalog(admin), smart],
    ["then the user's default model", null, { defaultModel: fast }, catalog(admin), fast],
    ["then the admin's", null, {}, catalog(admin), admin],
    ['with no preferences stored', null, null, catalog(admin), admin],
    ['or none', null, null, catalog(null), null],
    ['unknown while the preferences load', null, undefined, catalog(admin), undefined],
    ['unknown while the catalog loads', null, null, undefined, undefined],
    ['the inherited model even while loading', smart, undefined, undefined, smart],
  ])('chooses %s', (_, inherited, preferences, models, expected) => {
    expect(fallbackModel(inherited, preferences, models)).toEqual(expected)
  })
})
