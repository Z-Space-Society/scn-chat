import { afterEach, describe, expect, it } from 'vitest'
import { markSeen, resetSeenCache } from '../../../../src/features/chat-list/lib/seen.ts'

const read = () => JSON.parse(localStorage.getItem('scn-chat:seen:did:plc:alice') ?? 'null')

afterEach(() => {
  localStorage.clear()
  resetSeenCache()
})

describe('markSeen', () => {
  it('records seen replies and forgets chats that no longer exist', () => {
    markSeen('did:plc:alice', { a: 'a.r0', b: 'b.r0' })
    expect(read()).toEqual({ a: 'a.r0', b: 'b.r0' })
    markSeen('did:plc:alice', { a: 'a.r1' }, ['a'])
    expect(read()).toEqual({ a: 'a.r1' })
  })

  it('seeds an empty record, so a device with no chats yet starts tracking', () => {
    markSeen('did:plc:alice', {})
    expect(read()).toEqual({})
  })
})
