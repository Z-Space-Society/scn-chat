import { LexError } from '@atproto/lex-data'
import { verifySpaceSignature } from '@atproto/space'
import { describe, expect, it, vi } from 'vitest'
import {
  CredentialCache,
  CredentialError,
  mintSpaceCredential,
} from '../../src/sync/credentials.ts'

const space = 'at://did:plc:alice/space/network.sharedcomputer.chat.settings/self'

/** An unsigned credential JWT, enough for the client to read its expiry. */
function credentialToken(expSec = 3600) {
  const header = { typ: 'atproto-space-credential+jwt', alg: 'ES256' }
  const payload = {
    iss: 'did:plc:alice',
    sub: space,
    iat: 0,
    exp: expSec,
    jti: 'id',
    cnf: { kid: 'did:key:zTest' },
  }
  return `${[header, payload].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.')}.AA`
}

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
  it('exchanges a signed delegation token at the authority PDS', async () => {
    const token = credentialToken()
    const { deps: d, fetchImpl } = deps(Response.json({ credential: token }))
    const credential = await mintSpaceCredential(d, 'did:plc:alice', space)
    expect(credential.token).toBe(token)
    const request = fetchImpl.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://pds.test/xrpc/com.atproto.space.getSpaceCredential')
    expect(request.headers.get('authorization')).toBe('Bearer delegation-token')
    await expect(verifySpaceSignature(Object.fromEntries(request.headers))).resolves.toMatch(
      /^did:key:/,
    )
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

  it('fails when the PDS returns something other than a credential', async () => {
    const { deps: d } = deps(Response.json({ credential: 'not-a-jwt' }))
    await expect(mintSpaceCredential(d, 'did:plc:alice', space)).rejects.toMatchObject({
      code: 'InvalidResponse',
    })
  })

  it('signs later requests for the audience with the exchange key', async () => {
    const token = credentialToken()
    const { deps: d, fetchImpl } = deps(Response.json({ credential: token }))
    const credential = await mintSpaceCredential(d, 'did:plc:alice', space)
    fetchImpl.mockResolvedValueOnce(Response.json({}))
    await credential.fetch('https://pds.test/xrpc/com.atproto.space.listRepos', 'did:plc:bob')
    const [exchange = {}, headers = {}] = fetchImpl.mock.calls.map(([r]) =>
      Object.fromEntries(r.headers),
    )
    const exchangeKey = await verifySpaceSignature(exchange)
    expect(headers.authorization).toBe(`Atproto-Space ${token}`)
    expect(headers['atproto-space-audience']).toBe('did:plc:bob')
    await expect(verifySpaceSignature(headers, exchangeKey)).resolves.toBe(exchangeKey)
  })
})

describe('CredentialCache', () => {
  it('reuses a credential until close to expiry', async () => {
    let now = 0
    const { deps: d, fetchImpl } = deps(Response.json({ credential: credentialToken() }), () => now)
    const cache = new CredentialCache(d)
    await cache.get('did:plc:alice', space)
    await cache.get('did:plc:alice', space)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    now = 60 * 60_000
    await cache.get('did:plc:alice', space)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries once with a fresh credential after an auth failure', async () => {
    const { deps: d, fetchImpl } = deps(Response.json({ credential: credentialToken() }))
    const cache = new CredentialCache(d)
    let attempts = 0
    const result = await cache.withCredential('did:plc:alice', space, async () => {
      attempts++
      if (attempts === 1) throw new LexError('CredentialRevoked', 'revoked')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
