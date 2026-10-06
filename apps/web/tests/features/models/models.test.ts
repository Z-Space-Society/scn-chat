import { describe, expect, it } from 'vitest'
import { fallbackModel } from '../../../src/features/models/models.ts'

const smart = { provider: 'p', id: 'smart' }
const fast = { provider: 'p', id: 'fast' }
const admin = { provider: 'p', id: 'admin' }

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
