import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it } from 'vitest'
import { askAgain, generationOf, replyKey, userMessage } from '../../src/turns/request.ts'

describe('generationOf', () => {
  it("reads a user message's request, its attempt defaulting to 0", () => {
    expect(generationOf({ role: 'user', generation: {} })).toEqual({ attempt: 0 })
    expect(
      generationOf({ role: 'user', generation: { effort: 'high', tools: ['x'], attempt: 2 } }),
    ).toEqual({ effort: 'high', tools: ['x'], attempt: 2 })
  })

  it('finds no request on an assistant message or one without a generation object', () => {
    expect(generationOf({ role: 'assistant', generation: {} })).toBeNull()
    expect(generationOf({ role: 'user' })).toBeNull()
    expect(generationOf({ role: 'user', generation: 'please' })).toBeNull()
  })

  it("reads an invalid record's attempt when it is a whole number, and refuses one that is not", () => {
    expect(generationOf({ role: 'user', generation: { attempt: '3' } })?.attempt).toBe(3)
    expect(generationOf({ role: 'user', generation: { attempt: 1.5 } })).toBeNull()
    expect(generationOf({ role: 'user', generation: { attempt: 'next' } })).toBeNull()
  })
})

describe('the request records', () => {
  it('builds a user message that asks for its first reply only when given a generation', () => {
    const parts = [{ $type: `${nsid.defs}#textPart`, text: 'hi' }]
    const createdAt = '2026-10-13T00:00:00.000Z'
    expect(userMessage({ parts, createdAt })).toEqual({
      $type: nsid.message,
      role: 'user',
      content: { $type: `${nsid.defs}#plainContent`, parts },
      createdAt,
    })
    expect(
      userMessage({ parts, createdAt, parent: 'p', generation: { effort: 'low' } }),
    ).toMatchObject({
      parent: 'p',
      generation: { effort: 'low', attempt: 0 },
    })
  })

  it('asks again with the next attempt, replacing only the model or effort given', () => {
    const model = { provider: 'p', id: 'm' }
    const asked = askAgain({ role: 'user', generation: { effort: 'low', tools: ['x'] } }, { model })
    expect(asked.generation).toEqual({ effort: 'low', tools: ['x'], model, attempt: 1 })
    expect(askAgain({ role: 'user', generation: { attempt: 4 } }, {}).generation).toEqual({
      attempt: 5,
    })
  })

  it('keys a reply by its message and attempt', () => {
    expect(replyKey('3abc', 10)).toBe('3abc.r10')
  })
})
