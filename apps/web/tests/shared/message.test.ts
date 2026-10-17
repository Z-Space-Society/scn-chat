import { describe, expect, it } from 'vitest'
import { authorOf, isEncrypted, isFinished, isPending, partsOf } from '../../src/shared/message.ts'
import { messageRecord } from '../helpers/records.ts'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`

describe('message records', () => {
  it('tells a reply still being written from a finished one', () => {
    expect(isPending(messageRecord({ status: 'pending' }))).toBe(true)
    expect(isPending(messageRecord({ status: 'complete' }))).toBe(false)
    for (const status of ['complete', 'error', 'cancelled']) expect(isFinished(status)).toBe(true)
  })

  it("takes a status it doesn't know, from another client, as neither pending nor finished", () => {
    expect(isPending(messageRecord({ status: 'paused' }))).toBe(false)
    expect(isFinished('paused')).toBe(false)
    expect(isFinished(null)).toBe(false)
  })

  it('gives the parts of plain content, and none of encrypted content', () => {
    const text = { $type: d('textPart'), text: 'hi' }
    const plain = messageRecord({ content: { $type: d('plainContent'), parts: [text] } })
    const sealed = messageRecord({ content: { $type: d('encryptedContent'), ciphertext: 'x' } })
    expect(partsOf(plain)).toEqual([text])
    expect(isEncrypted(plain)).toBe(false)
    expect(partsOf(sealed)).toEqual([])
    expect(isEncrypted(sealed)).toBe(true)
  })

  it("names the user, or the reply's model, or the assistant when no model is known", () => {
    expect(authorOf(messageRecord({ role: 'user' }))).toBe('You')
    expect(authorOf(messageRecord({ model: { provider: 'p', id: 'claude' } }))).toBe('claude')
    expect(authorOf(messageRecord())).toBe('Assistant')
  })
})
