import { DidError, OAuthResolverError } from '@atproto/oauth-client-node'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { SpacesLostError } from '../../src/auth/accounts.ts'
import { createWebSession } from '../../src/auth/web-session.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import {
  authDeps,
  fakeOAuth,
  fakeSession,
  LOGIN_STATE,
  loginCookie,
  ORIGIN,
  sessionCookie,
} from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'

async function setup(overrides: Parameters<typeof authDeps>[1] = {}) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const auth = authDeps(db, overrides)
  const app = createApp({ config: testConfig(), db, logger: pino({ level: 'silent' }), auth })
  return { db, auth, app }
}

async function signIn(app: Awaited<ReturnType<typeof setup>>['app']) {
  const res = await app.request('/oauth/callback?code=abc&state=xyz', loginCookie)
  return sessionCookie(res)
}

describe('client metadata name', () => {
  it('serves the current app name in confidential client metadata', async () => {
    const oauth = fakeOAuth({
      clientMetadata: { client_id: 'https://chat.example.com/meta', client_name: 'Startup' },
    } as never)
    const { app, auth } = await setup({ oauth })
    await auth.settings.set('general', { appName: 'Renamed' }, 'did:plc:admin')
    expect(await (await app.request('/oauth-client-metadata.json')).json()).toEqual({
      client_id: 'https://chat.example.com/meta',
      client_name: 'Renamed',
    })
  })
})

describe('GET /oauth/login', () => {
  it('redirects to the authorization URL with the app scope', async () => {
    const { app, auth } = await setup()
    const res = await app.request('/oauth/login?identifier=alice.test')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://pds.test/oauth/authorize?request_uri=x')
    expect(auth.oauth.authorize).toHaveBeenCalledWith('alice.test', {
      scope: auth.scope,
      state: expect.any(String),
    })
    expect(res.headers.get('set-cookie')).toMatch(/scn_login=[^;]+;.*HttpOnly/)
  })

  it('shows an invalid_scope error from the PDS on the login page', async () => {
    const oauth = fakeOAuth({
      authorize: vi.fn(async () => {
        throw new Error('invalid_scope: permission set not found')
      }),
    })
    const { app } = await setup({ oauth })
    const res = await app.request('/oauth/login?identifier=alice.test')
    expect(decodeURIComponent(res.headers.get('location') ?? '')).toContain('invalid_scope')
  })

  /** The login page's error after authorize throws. */
  async function loginErrorFor(error: unknown, identifier = 'alice.test') {
    const oauth = fakeOAuth({
      authorize: vi.fn(async () => {
        throw error
      }),
    })
    const { app } = await setup({ oauth })
    const res = await app.request(`/oauth/login?identifier=${identifier}`)
    return new URL(res.headers.get('location') ?? '', 'http://x').searchParams.get('error')
  }

  it("explains an unknown handle and an unknown DID differently, instead of the resolver's message", async () => {
    const handleCause = Object.assign(new Error('Handle "alice.test" does not resolve to a DID'), {
      name: 'IdentityResolverError',
    })
    const handle = await loginErrorFor(
      new OAuthResolverError('Failed to resolve identity: alice.test', { cause: handleCause }),
    )
    const didCause = new DidError('did:plc:nobody', 'DID not found', 'did-unknown', 404)
    const did = await loginErrorFor(
      new OAuthResolverError('Failed to resolve identity: did:plc:nobody', { cause: didCause }),
      'did:plc:nobody',
    )
    expect(handle).not.toContain('Failed to resolve')
    expect(did).not.toContain('Failed to resolve')
    expect(handle).not.toBe(did)
  })

  it("keeps the resolver's message for failures after the account was found", async () => {
    const error = new OAuthResolverError(
      'Failed to resolve OAuth server metadata for https://pds.test',
    )
    expect(await loginErrorFor(error)).toContain('Failed to resolve OAuth server metadata')
  })
})

describe('GET /oauth/callback', () => {
  it.each([
    ['no login cookie', {}],
    ['a login cookie for another sign-in', { headers: { cookie: 'scn_login=someone-else' } }],
  ])('refuses a callback with %s, and revokes its tokens', async (_, init) => {
    const { app, auth } = await setup()
    const res = await app.request('/oauth/callback?code=abc&state=xyz', init)
    expect(res.headers.get('location')).toMatch(/^\/login\?error=/)
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/scn_session=[^;]/)
    expect(auth.oauth.revoke).toHaveBeenCalledWith('did:plc:alice')
  })

  it('returns to the page the sign-in started from, if it is on this site', async () => {
    const { app } = await setup()
    const login = await app.request(
      '/oauth/login?identifier=alice.test&next=%2Fs%2Fdid%3Aplc%3Abob%2F3abc',
    )
    expect(login.headers.get('set-cookie')).toMatch(/scn_next=/)
    const res = await app.request('/oauth/callback?code=abc&state=xyz', {
      headers: { cookie: `${loginCookie.headers.cookie}; scn_next=%2Fs%2Fdid%3Aplc%3Abob%2F3abc` },
    })
    expect(res.headers.get('location')).toBe('/s/did:plc:bob/3abc')
  })

  it('ignores a return address on another site', async () => {
    const { app } = await setup()
    for (const next of ['//evil.test/x', '/\\evil.test', 'https://evil.test']) {
      const login = await app.request(
        `/oauth/login?identifier=alice.test&next=${encodeURIComponent(next)}`,
      )
      expect(login.headers.get('set-cookie')).not.toMatch(/scn_next=/)
    }
    const res = await app.request('/oauth/callback?code=abc&state=xyz', {
      headers: {
        cookie: `${loginCookie.headers.cookie}; scn_next=${encodeURIComponent('//evil.test')}`,
      },
    })
    expect(res.headers.get('location')).toBe('/')
  })

  it('sets an HttpOnly, SameSite=Lax session cookie and redirects home', async () => {
    const { app } = await setup()
    const res = await app.request('/oauth/callback?code=abc&state=xyz', loginCookie)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('creates a local account when the PDS dropped the space permissions', async () => {
    const oauth = fakeOAuth({
      callback: vi.fn(async () => ({
        session: fakeSession('did:plc:alice', 'atproto'),
        state: LOGIN_STATE,
      })),
    })
    const { app } = await setup({ oauth })
    const cookie = await signIn(app)
    const me = (await (await app.request('/api/me', { headers: { cookie } })).json()) as {
      storageMode: string
    }
    expect(me.storageMode).toBe('local')
  })

  it('turns away a space account that loses spaces support, and revokes its tokens', async () => {
    const { app, db } = await setup()
    await signIn(app)
    const oauth = fakeOAuth({
      callback: vi.fn(async () => ({
        session: fakeSession('did:plc:alice', 'atproto'),
        state: LOGIN_STATE,
      })),
    })
    const again = createApp({
      config: testConfig(),
      db,
      logger: pino({ level: 'silent' }),
      auth: authDeps(db, { oauth }),
    })
    const res = await again.request('/oauth/callback?code=abc&state=xyz', loginCookie)
    expect(decodeURIComponent(res.headers.get('location') ?? '')).toContain(
      new SpacesLostError().message,
    )
    expect(oauth.revoke).toHaveBeenCalledWith('did:plc:alice')
  })
})

describe('API session handling', () => {
  it('returns 401 from /api/me without a session', async () => {
    const { app } = await setup()
    expect((await app.request('/api/me')).status).toBe(401)
  })

  it('re-issues the session cookie when it renews the session', async () => {
    const { app, db } = await setup()
    await signIn(app)
    const token = await createWebSession(
      db,
      'did:plc:alice',
      30,
      new Date(Date.now() - 20 * 86_400_000),
    )
    const fresh = await app.request('/api/me', { headers: { cookie: `scn_session=${token}` } })
    expect(fresh.headers.get('set-cookie')).toMatch(
      new RegExp(`scn_session=${token};.*Max-Age=2592000`),
    )
    const recent = await createWebSession(db, 'did:plc:alice', 30)
    const res = await app.request('/api/me', { headers: { cookie: `scn_session=${recent}` } })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('refuses a non-GET API request with a foreign Origin or none', async () => {
    const { app } = await setup()
    const cookie = await signIn(app)
    const foreign = await app.request('/api/logout', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.test' },
    })
    expect(foreign.status).toBe(403)
    expect((await app.request('/api/logout', { method: 'POST', headers: { cookie } })).status).toBe(
      403,
    )
  })
})

describe('POST /api/logout', () => {
  it('clears the web session and keeps the OAuth session', async () => {
    const { app, auth } = await setup()
    const cookie = await signIn(app)
    const res = await app.request('/api/logout', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN },
    })
    expect(res.status).toBe(200)
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(401)
    expect(auth.oauth.revoke).not.toHaveBeenCalled()
  })

  it('revokes the OAuth session and every web session when signing out everywhere', async () => {
    const { app, auth } = await setup()
    const first = await signIn(app)
    const second = await signIn(app)
    await app.request('/api/logout?everywhere=1', {
      method: 'POST',
      headers: { cookie: first, origin: ORIGIN },
    })
    expect(auth.oauth.revoke).toHaveBeenCalledWith('did:plc:alice')
    expect((await app.request('/api/me', { headers: { cookie: second } })).status).toBe(401)
  })
})
