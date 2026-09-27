import { JoseKey } from '@atproto/oauth-client-node'
import { describe, expect, it } from 'vitest'
import { createOAuthClient, isLoopbackUrl } from '../../src/auth/oauth-client.ts'
import { buildScope } from '../../src/auth/scope.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'

describe('isLoopbackUrl', () => {
  it.each([
    ['http://127.0.0.1:3000', true],
    ['http://localhost:3000', true],
    ['http://[::1]:3000', true],
    ['https://chat.example.com', false],
  ])('%s is loopback: %s', (url, expected) => {
    expect(isLoopbackUrl(url)).toBe(expected)
  })
})

describe('createOAuthClient', () => {
  it('uses loopback client metadata for a loopback public URL', async () => {
    const db = createSqliteDb()
    await migrateToLatest(db)
    const client = await createOAuthClient(testConfig(), db, buildScope('raw'))
    expect(String(client.clientMetadata.client_id)).toMatch(/^http:\/\/localhost/)
    expect(client.clientMetadata.token_endpoint_auth_method).toBe('none')
  })

  it('is a confidential client with published keys for an HTTPS public URL', async () => {
    const db = createSqliteDb()
    await migrateToLatest(db)
    const key = await JoseKey.generate(['ES256'], 'test-key')
    const config = testConfig({
      PUBLIC_URL: 'https://chat.example.com',
      OAUTH_PRIVATE_KEYS: JSON.stringify([key.privateJwk]),
    })
    const client = await createOAuthClient(config, db, buildScope('permission-set'))
    expect(client.clientMetadata).toMatchObject({
      client_id: 'https://chat.example.com/oauth-client-metadata.json',
      token_endpoint_auth_method: 'private_key_jwt',
      jwks_uri: 'https://chat.example.com/oauth/jwks.json',
      dpop_bound_access_tokens: true,
    })
    expect(JSON.stringify(client.jwks)).toContain('test-key')
    expect(JSON.stringify(client.jwks)).not.toContain('"d"')
  })
})
