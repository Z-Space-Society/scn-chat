import { describe, expect, it } from 'vitest'
import { type ConfigError, loadConfig } from '../src/config.ts'

const SECRET_KEY = Buffer.alloc(32, 1).toString('base64')
const env = { SECRET_KEY, ADMIN_DIDS: 'did:plc:admin' }

/** The variables loadConfig names as at fault. */
function faultsIn(vars: Record<string, string>): string[] {
  try {
    loadConfig(vars)
  } catch (err) {
    return (err as ConfigError).names.sort()
  }
  throw new Error('expected loadConfig to fail')
}

describe('loadConfig', () => {
  it('trims a trailing slash from the public URL and splits ADMIN_DIDS', () => {
    const config = loadConfig({
      ...env,
      PUBLIC_URL: 'https://chat.example.com/',
      ADMIN_DIDS: 'did:plc:a, did:web:b.example.com',
    })
    expect(config).toMatchObject({
      publicUrl: 'https://chat.example.com',
      adminDids: ['did:plc:a', 'did:web:b.example.com'],
    })
  })

  it('fails naming ADMIN_DIDS when it is missing or holds an invalid DID', () => {
    expect(faultsIn({ SECRET_KEY })).toEqual(['ADMIN_DIDS'])
    expect(faultsIn({ ...env, ADMIN_DIDS: 'did:plc:a,alice' })).toEqual(['ADMIN_DIDS'])
    expect(() => loadConfig({ ...env, ADMIN_DIDS: 'did:plc:a,alice' })).toThrow(/alice/)
  })

  it('reports every invalid variable at once', () => {
    expect(faultsIn({ PORT: '0', PUBLIC_URL: 'nope' })).toEqual([
      'ADMIN_DIDS',
      'PORT',
      'PUBLIC_URL',
      'SECRET_KEY',
    ])
  })

  it('fails naming SECRET_KEY when it is not 32 bytes', () => {
    expect(faultsIn({ ...env, SECRET_KEY: Buffer.alloc(16).toString('base64') })).toEqual([
      'SECRET_KEY',
    ])
  })

  it('parses retired keys from a comma-separated list', () => {
    const old = Buffer.alloc(32, 2).toString('base64')
    expect(loadConfig({ ...env, SECRET_KEYS_OLD: `${old}, ${old}` }).oldSecretKeys).toHaveLength(2)
  })

  it('treats empty values as unset', () => {
    expect(
      loadConfig({ ...env, OAUTH_PRIVATE_KEYS: '', SECRET_KEYS_OLD: '', DATABASE_URL: '' }),
    ).toMatchObject({
      oauthPrivateKeys: [],
      oldSecretKeys: [],
      databaseUrl: 'sqlite:./data/scn-chat.sqlite',
    })
  })

  it('fails naming OAUTH_PRIVATE_KEYS when it is not a JSON array of keys', () => {
    expect(faultsIn({ ...env, OAUTH_PRIVATE_KEYS: 'not json' })).toEqual(['OAUTH_PRIVATE_KEYS'])
  })

  it('refuses an HTTP public URL, missing keys, and raw scopes in production', () => {
    expect(
      faultsIn({
        ...env,
        NODE_ENV: 'production',
        PUBLIC_URL: 'http://chat.example.com',
        OAUTH_SCOPE_MODE: 'raw',
      }),
    ).toEqual(['OAUTH_PRIVATE_KEYS', 'OAUTH_SCOPE_MODE', 'PUBLIC_URL'])
  })
})
