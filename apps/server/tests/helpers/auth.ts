import type { OAuthSession } from '@atproto/oauth-client-node'
import pino from 'pino'
import { vi } from 'vitest'
import type { IdentityResolver } from '../../src/auth/identity.ts'
import type { OAuthClientLike } from '../../src/auth/oauth-client.ts'
import type { AuthDeps } from '../../src/auth/routes.ts'
import { buildScope } from '../../src/auth/scope.ts'
import type { Db } from '../../src/db/index.ts'
import { testConfig } from './config.ts'
import { testAccess } from './settings.ts'

export const ORIGIN = 'http://127.0.0.1:3000'

/** The OAuth state the fake client returns, and the cookie that matches it. */
export const LOGIN_STATE = 'test-login-state'
export const loginCookie = { headers: { cookie: `scn_login=${LOGIN_STATE}` } }

export function fakeSession(did: string, scope: string) {
  return { did, getTokenInfo: vi.fn(async () => ({ scope })) } as unknown as OAuthSession
}

export function fakeOAuth(overrides: Partial<OAuthClientLike> = {}): OAuthClientLike {
  return {
    clientMetadata: { client_id: 'http://localhost' },
    jwks: { keys: [] },
    authorize: vi.fn(async () => new URL('https://pds.test/oauth/authorize?request_uri=x')),
    callback: vi.fn(async () => ({
      session: fakeSession('did:plc:alice', buildScope('raw')),
      state: LOGIN_STATE,
    })),
    restore: vi.fn(async (did: string) => fakeSession(did, buildScope('raw'))),
    revoke: vi.fn(async () => {}),
    ...overrides,
  }
}

/** An identity resolver with fresh mocks for each test. */
export const fakeIdentity = (): IdentityResolver => ({
  resolve: vi.fn(async (did: string) => ({
    did,
    handle: 'alice.test',
    pdsUrl: 'https://pds.test',
  })),
  resolveHandle: vi.fn(async () => 'did:plc:alice'),
  resolveSigningKey: vi.fn(async () => 'did:key:zQ3shtest'),
})

export function authDeps(db: Db, overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    config: testConfig(),
    db,
    logger: pino({ level: 'silent' }),
    oauth: fakeOAuth(),
    identity: fakeIdentity(),
    ...testAccess(db),
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
