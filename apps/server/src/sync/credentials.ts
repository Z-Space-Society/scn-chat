import { Client } from '@atproto/lex-client'
import { LexError } from '@atproto/lex-data'
import { JoseKey } from '@atproto/oauth-client-node'
import { createDpopProof } from '@atproto/space'
import { atproto } from '@scn-chat/lexicons'
import type { PdsClientFactory } from '../auth/pds.ts'

// Plain strings don't satisfy the generated methods' branded string types.
type Loose = any

const CREDENTIAL_TTL_MS = 2 * 60 * 60_000
const REFRESH_MARGIN_MS = 5 * 60_000

/** A DPoP-bound space credential, usable against any repo host in its space. */
export class SpaceCredential {
  readonly token: string
  readonly expiresAt: number
  private readonly key: JoseKey
  private readonly fetchImpl: typeof fetch

  constructor(token: string, key: JoseKey, expiresAt: number, fetchImpl: typeof fetch = fetch) {
    this.token = token
    this.key = key
    this.expiresAt = expiresAt
    this.fetchImpl = fetchImpl
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, { ...init, redirect: 'error' })
    request.headers.set('authorization', `DPoP ${this.token}`)
    request.headers.set(
      'dpop',
      await createDpopProof(this.key, {
        htm: request.method,
        htu: request.url,
        credential: this.token,
      }),
    )
    return this.fetchImpl(request)
  }

  client(service: string): Client {
    return new Client({ service, fetch: this.fetch })
  }
}

export class CredentialError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CredentialError'
    this.code = code
  }
}

export type CredentialDeps = {
  /** A client for the user asking, acting through their own OAuth session. */
  getPdsClient: PdsClientFactory
  /** The PDS answering for a space authority. */
  resolvePds: (did: string) => Promise<string>
  fetch?: typeof fetch
  now?: () => number
}

const authorityOf = (space: string) => {
  const did = space.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1]
  if (!did) throw new CredentialError('InvalidSpace', `Not a space URI: ${space}`)
  return did
}

/** Get a space credential for a space, acting for a user, without caching. */
export async function mintSpaceCredential(
  deps: CredentialDeps,
  actorDid: string,
  space: string,
): Promise<SpaceCredential> {
  const now = deps.now ?? Date.now
  const fetchImpl = deps.fetch ?? fetch
  const actor: Loose = await deps.getPdsClient(actorDid)
  const { token } = await actor.call(atproto.space.getDelegationToken, { space })
  const authorityPds = await deps.resolvePds(authorityOf(space))
  const key = await JoseKey.generate(['ES256'])
  const url = new URL('/xrpc/com.atproto.space.getSpaceCredential', authorityPds)
  const request = new Request(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ space }),
  })
  request.headers.set('dpop', await createDpopProof(key, { htm: request.method, htu: request.url }))
  const response = await fetchImpl(request)
  const body = (await response.json().catch(() => ({}))) as {
    credential?: string
    error?: string
    message?: string
  }
  if (!response.ok || !body.credential) {
    throw new CredentialError(
      body.error ?? 'InvalidResponse',
      body.message ?? `getSpaceCredential returned ${response.status}`,
    )
  }
  return new SpaceCredential(body.credential, key, now() + CREDENTIAL_TTL_MS, fetchImpl)
}

/** Space credentials cached per space and actor for their two-hour life. */
export class CredentialCache {
  private readonly cache = new Map<string, SpaceCredential>()
  private readonly deps: CredentialDeps

  constructor(deps: CredentialDeps) {
    this.deps = deps
  }

  async get(actorDid: string, space: string): Promise<SpaceCredential> {
    const key = `${actorDid} ${space}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > (this.deps.now ?? Date.now)())
      return cached
    const fresh = await mintSpaceCredential(this.deps, actorDid, space)
    this.cache.set(key, fresh)
    return fresh
  }

  discard(actorDid: string, space: string): void {
    this.cache.delete(`${actorDid} ${space}`)
  }

  /** Run a call with a cached credential, retrying once with a fresh one after an auth failure. */
  async withCredential<T>(
    actorDid: string,
    space: string,
    fn: (credential: SpaceCredential) => Promise<T>,
  ): Promise<T> {
    try {
      return await fn(await this.get(actorDid, space))
    } catch (err) {
      const code = err instanceof LexError ? err.error : undefined
      if (code !== 'AuthenticationRequired' && code !== 'InvalidToken' && code !== 'ExpiredToken')
        throw err
      this.discard(actorDid, space)
      return fn(await this.get(actorDid, space))
    }
  }
}
