import { describe, expect, it } from 'vitest'
import { chat, nsid, validateRecord } from '../src/index.ts'

const textContent = {
  $type: `${nsid.defs}#plainContent`,
  parts: [{ $type: `${nsid.defs}#textPart`, text: 'hi' }],
}

describe('validateRecord', () => {
  it('rejects a float where the lexicon expects an integer', () => {
    const record = {
      $type: nsid.message,
      role: 'assistant',
      content: textContent,
      usage: { inputTokens: 1.5 },
      createdAt: new Date().toISOString(),
    }
    expect(validateRecord(nsid.message, record).success).toBe(false)
  })

  it('accepts blob references and bytes in their JSON form', () => {
    const record = {
      $type: nsid.message,
      role: 'user',
      createdAt: new Date().toISOString(),
      content: {
        $type: `${nsid.defs}#encryptedContent`,
        scheme: 'x',
        keyId: 'k',
        nonce: { $bytes: 'AAAAAAAAAAAAAAAA' },
        ciphertext: { $bytes: 'AAAA' },
        blobs: [
          {
            $type: 'blob',
            ref: { $link: 'bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy' },
            mimeType: 'image/png',
            size: 10,
          },
        ],
      },
    }
    expect(validateRecord(nsid.message, record)).toEqual({ success: true })
  })
})

describe('nsid', () => {
  it('matches the NSIDs in the generated lexicon code', () => {
    for (const [name, value] of Object.entries(nsid)) {
      const generated = chat[name as keyof typeof chat] as { $nsid?: string }
      // defs holds only shared definitions, so its module has no $nsid to compare.
      if (name !== 'defs') expect(value).toBe(generated.$nsid)
      else expect(generated).toBeDefined()
    }
  })
})
