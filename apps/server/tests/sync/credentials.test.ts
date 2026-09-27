import { LexError } from '@atproto/lex-data'
import { describe, expect, it, vi } from 'vitest'
import {
  CredentialCache,
  CredentialError,
  mintSpaceCredential,
} from '../../src/sync/credentials.ts'

const space = 'at://did:plc:alice/space/network.sharedcomputer.chat.settings/self'

function deps(response: Response, now = () => 1_000) {
  const fetchImpl = vi.fn(async (_request: Request) => response.clone())
  return {
    fetchImpl,
    deps: {
      getPdsClient: async () =>
        ({ call: vi.fn(async () => ({ token: 'delegation-token' })) }) as never,
      resolvePds: vi.fn(async () => 'https://pds.test'),
      fetch: fetchImpl as unknown as typeof fetch,
      now,
    },
  }
}

describe('mintSpaceCredential', () => {
  it('exchanges a delegation token with a DPoP proof at the authority PDS', async () => {
    const { deps: d, fetchImpl } = deps(Response.json({ credential: 'space-credential' }))
    const credential = await mintSpaceCredential(d, 'did:plc:alice', space)
    expect(credential.token).toBe('space-credential')
    const request = fetchImpl.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://pds.test/xrpc/com.atproto.space.getSpaceCredential')
    expect(request.headers.get('authorization')).toBe('Bearer delegation-token')
    expect(request.headers.get('dpop')).toMatch(/^ey/)
    expect(d.resolvePds).toHaveBeenCalledWith('did:plc:alice')
  })

  it('fails with the PDS error code when the exchange is refused', async () => {
    const { deps: d } = deps(
      Response.json({ error: 'UserNotAuthorized', message: 'no' }, { status: 403 }),
    )
    const promise = mintSpaceCredential(d, 'did:plc:alice', space)
    await expect(promise).rejects.toBeInstanceOf(CredentialError)
    await expect(promise).rejects.toMatchObject({ code: 'UserNotAuthorized' })
  })

  it('sends a DPoP-bound credential on later requests', async () => {
    const { deps: d, fetchImpl } = deps(Response.json({ credential: 'space-credential' }))
    const credential = await mintSpaceCredential(d, 'did:plc:alice', space)
    fetchImpl.mockResolvedValueOnce(Response.json({}))
    await credential.fetch('https://pds.test/xrpc/com.atproto.space.listRepos')
    const request = fetchImpl.mock.calls[1]?.[0] as Request
    expect(request.headers.get('authorization')).toBe('DPoP space-credential')
    expect(request.headers.get('dpop')).toMatch(/^ey/)
  })
})

describe('CredentialCache', () => {
  it('reuses a credential until close to expiry', async () => {
    let now = 0
    const { deps: d, fetchImpl } = deps(Response.json({ credential: 'c' }), () => now)
    const cache = new CredentialCache(d)
    await cache.get('did:plc:alice', space)
    await cache.get('did:plc:alice', space)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now = 2 * 60 * 60_000
    await cache.get('did:plc:alice', space)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries once with a fresh credential after an auth failure', async () => {
    const { deps: d, fetchImpl } = deps(Response.json({ credential: 'c' }))
    const cache = new CredentialCache(d)
    let attempts = 0
    const result = await cache.withCredential('did:plc:alice', space, async () => {
      attempts++
      if (attempts === 1) throw new LexError('ExpiredToken', 'expired')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
