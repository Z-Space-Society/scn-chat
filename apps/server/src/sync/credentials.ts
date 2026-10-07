import { P256Keypair } from '@atproto/crypto'
import { Client } from '@atproto/lex-client'
import { LexError } from '@atproto/lex-data'
import { createSpaceSigHeaders, parseSpaceToken, SpaceTokenError } from '@atproto/space'
import type { DidString } from '@atproto/syntax'
import { atproto } from '@scn-chat/lexicons'
import type { PdsClientFactory } from '../auth/pds.ts'
import type { Loose } from '../loose.ts'
import { parseSpaceUri } from '../storage/records.ts'

const REFRESH_MARGIN_MS = 5 * 60_000
const AUTH_FAILURES = new Set([
  'AuthenticationRequired',
  'InvalidToken',
  'ExpiredToken',
  'JwtExpired',
  'CredentialRevoked',
])

/** A space credential bound to a signing key, usable against any repo host in its space. */
export class SpaceCredential {
  readonly token: string
  readonly expiresAt: number
  private readonly key: P256Keypair
  private readonly fetchImpl: typeof fetch

  constructor(token: string, key: P256Keypair, fetchImpl: typeof fetch = fetch) {
    this.token = token
    this.key = key
    this.expiresAt = parseSpaceToken('credential', token).payload.exp * 1000
    this.fetchImpl = fetchImpl
  }

  /** Each request is signed for the DID of the repo it reads, or the owner's for the space itself. */
  fetch = async (
    input: string | URL | Request,
    audience: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, { ...init, redirect: 'error' })
    const headers = await createSpaceSigHeaders(this.key, {
      authorization: `Atproto-Space ${this.token}`,
      audience: audience as DidString,
    })
    for (const [name, value] of Object.entries(headers)) request.headers.set(name, value)
    return this.fetchImpl(request)
  }

  client(service: string, audience: string): Client {
    return new Client({ service, fetch: (input, init) => this.fetch(input, audience, init) })
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

/** Get a space credential for a space, acting for a user, without caching. */
export async function mintSpaceCredential(
  deps: CredentialDeps,
  actorDid: string,
  space: string,
): Promise<SpaceCredential> {
  const fetchImpl = deps.fetch ?? fetch
  const actor: Loose = await deps.getPdsClient(actorDid)
  const { token } = await actor.call(atproto.space.getDelegationToken, { space })
  const authorityPds = await deps.resolvePds(parseSpaceUri(space).did)
  const key = await P256Keypair.create()
  const url = new URL('/xrpc/com.atproto.space.getSpaceCredential', authorityPds)
  const request = new Request(url, {
    method: 'POST',
    redirect: 'error',
    headers: {
      accept: 'application/json',
      ...(await createSpaceSigHeaders(key, { authorization: `Bearer ${token}` })),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ space }),
  })
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
  try {
    return new SpaceCredential(body.credential, key, fetchImpl)
  } catch (err) {
    if (!(err instanceof SpaceTokenError)) throw err
    throw new CredentialError('InvalidResponse', `getSpaceCredential returned ${err.message}`)
  }
}

/** Space credentials cached per space and actor until they expire. */
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
      if (!(err instanceof LexError && AUTH_FAILURES.has(err.error))) throw err
      this.discard(actorDid, space)
      return fn(await this.get(actorDid, space))
    }
  }
}
