import type { OAuthSession } from '@atproto/oauth-client-node'
import pino from 'pino'
import { vi } from 'vitest'
import type { IdentityResolver } from '../../src/auth/identity.ts'
import type { OAuthClientLike } from '../../src/auth/oauth-client.ts'
import { createRoles } from '../../src/auth/roles.ts'
import type { AuthDeps } from '../../src/auth/routes.ts'
import { buildScope } from '../../src/auth/scope.ts'
import type { Db } from '../../src/db/index.ts'
import { testConfig } from './config.ts'

export const ORIGIN = 'http://127.0.0.1:3000'

export function fakeSession(did: string, scope: string) {
  return { did, getTokenInfo: vi.fn(async () => ({ scope })) } as unknown as OAuthSession
}

export function fakeOAuth(overrides: Partial<OAuthClientLike> = {}): OAuthClientLike {
  return {
    clientMetadata: { client_id: 'http://localhost' },
    jwks: { keys: [] },
    authorize: vi.fn(async () => new URL('https://pds.test/oauth/authorize?request_uri=x')),
    callback: vi.fn(async () => ({ session: fakeSession('did:plc:alice', buildScope('raw')) })),
    restore: vi.fn(async (did: string) => fakeSession(did, buildScope('raw'))),
    revoke: vi.fn(async () => {}),
    ...overrides,
  }
}

export const fakeIdentity: IdentityResolver = {
  resolve: vi.fn(async (did: string) => ({
    did,
    handle: 'alice.test',
    pdsUrl: 'https://pds.test',
  })),
  resolveHandle: vi.fn(async () => 'did:plc:alice'),
  resolveSigningKey: vi.fn(async () => 'did:key:zQ3shtest'),
}

export function authDeps(db: Db, overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    config: testConfig(),
    db,
    logger: pino({ level: 'silent' }),
    oauth: fakeOAuth(),
    identity: fakeIdentity,
    roles: createRoles({ staff: ['did:plc:alice'] }),
    scope: buildScope('raw'),
    ...overrides,
  }
}

/** The session cookie from a response, ready to send back. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const match = header.match(/scn_session=([^;]+)/)
  if (!match) throw new Error(`No session cookie in: ${header}`)
  return `scn_session=${match[1]}`
}
