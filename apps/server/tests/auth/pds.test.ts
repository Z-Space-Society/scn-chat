import { TokenRefreshError } from '@atproto/oauth-client-node'
import { describe, expect, it, vi } from 'vitest'
import { createPdsClientFactory, SessionExpired } from '../../src/auth/pds.ts'
import { fakeOAuth } from '../helpers/auth.ts'

describe('createPdsClientFactory', () => {
  it('returns a client for a restorable session', async () => {
    const getClient = createPdsClientFactory(fakeOAuth())
    await expect(getClient('did:plc:alice')).resolves.toBeDefined()
  })

  it('throws SessionExpired when the session has expired or been revoked', async () => {
    const oauth = fakeOAuth({
      restore: vi.fn(async () => {
        throw new TokenRefreshError('did:plc:alice', 'refresh failed')
      }),
    })
    const promise = createPdsClientFactory(oauth)('did:plc:alice')
    await expect(promise).rejects.toBeInstanceOf(SessionExpired)
  })

  it('passes other restore failures through unchanged', async () => {
    const outage = new Error('fetch failed')
    const oauth = fakeOAuth({
      restore: vi.fn(async () => {
        throw outage
      }),
    })
    await expect(createPdsClientFactory(oauth)('did:plc:alice')).rejects.toBe(outage)
  })
})
