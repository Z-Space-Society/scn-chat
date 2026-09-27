import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

export class SecretDecryptError extends Error {
  constructor(reason: string) {
    super(`Cannot decrypt secret: ${reason}`)
    this.name = 'SecretDecryptError'
  }
}

function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8)
}

/** Encrypt secrets with the current key, and decrypt with the current or any retired key. */
export class SecretBox {
  private readonly current: { id: string; key: Buffer }
  private readonly keys: Map<string, Buffer>

  constructor(currentKey: Buffer, oldKeys: Buffer[] = []) {
    this.current = { id: keyId(currentKey), key: currentKey }
    this.keys = new Map([currentKey, ...oldKeys].map((key) => [keyId(key), key]))
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.current.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [VERSION, this.current.id, iv, tag, ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join(':')
  }

  decrypt(value: string): string {
    const [version, id, iv, tag, ciphertext] = value.split(':')
    if (version !== VERSION || !id || !iv || !tag || ciphertext === undefined) {
      throw new SecretDecryptError('unrecognized format')
    }
    const key = this.keys.get(id)
    if (!key) throw new SecretDecryptError(`no key with id ${id}`)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  }
}
