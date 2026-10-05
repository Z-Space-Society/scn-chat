import { describe, expect, it } from 'vitest'
import { validateBranchSearch, validateChatListSearch } from '../../src/shared/search-params.ts'

describe('search params', () => {
  it('keeps text values', () => {
    expect(validateChatListSearch({ q: 'blue tile' })).toEqual({ q: 'blue tile' })
    expect(validateBranchSearch({ m: '3lbx.r1' })).toEqual({ m: '3lbx.r1' })
  })

  it('turns values the router parsed as numbers back into text', () => {
    expect(validateChatListSearch({ q: 2024 })).toEqual({ q: '2024' })
  })

  it('drops empty and non-text values', () => {
    expect(validateChatListSearch({ q: '' })).toEqual({})
    expect(validateBranchSearch({ m: { x: 1 } })).toEqual({})
    expect(validateBranchSearch({})).toEqual({})
  })
})
