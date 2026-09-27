import { describe, expect, it } from 'vitest'
import { SecretBox, SecretDecryptError } from '../src/secrets.ts'

const keyA = Buffer.alloc(32, 1)
const keyB = Buffer.alloc(32, 2)

describe('SecretBox', () => {
  it('round-trips a secret', () => {
    const box = new SecretBox(keyA)
    expect(box.decrypt(box.encrypt('sk-live-123'))).toBe('sk-live-123')
  })

  it('never stores the plaintext and uses a fresh IV each time', () => {
    const box = new SecretBox(keyA)
    const first = box.encrypt('sk-live-123')
    expect(first).not.toContain('sk-live-123')
    expect(box.encrypt('sk-live-123')).not.toBe(first)
  })

  it('writes the version and key ID into the value', () => {
    expect(new SecretBox(keyA).encrypt('x')).toMatch(/^v1:[0-9a-f]{8}:/)
  })

  it('decrypts values from a retired key and encrypts new values with the current key', () => {
    const old = new SecretBox(keyA).encrypt('sk-old')
    const rotated = new SecretBox(keyB, [keyA])
    expect(rotated.decrypt(old)).toBe('sk-old')
    expect(rotated.encrypt('sk-new').split(':')[1]).toBe(rotated.encrypt('x').split(':')[1])
    expect(new SecretBox(keyB).decrypt(rotated.encrypt('sk-new'))).toBe('sk-new')
  })

  it('fails loudly for a value from an unknown key', () => {
    const value = new SecretBox(keyA).encrypt('x')
    expect(() => new SecretBox(keyB).decrypt(value)).toThrow(SecretDecryptError)
  })

  it('fails loudly for a tampered value', () => {
    const box = new SecretBox(keyA)
    const parts = box.encrypt('secret').split(':')
    parts[4] = Buffer.from('tampered').toString('base64url')
    expect(() => box.decrypt(parts.join(':'))).toThrow()
  })
})
