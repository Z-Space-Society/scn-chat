import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { SpacesLostError } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { authDeps, fakeOAuth, fakeSession, ORIGIN, sessionCookie } from '../helpers/auth.ts'
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
  const res = await app.request('/oauth/callback?code=abc&state=xyz')
  return sessionCookie(res)
}

describe('client metadata and keys', () => {
  it('serves the client metadata and public keys', async () => {
    const { app } = await setup()
    expect(await (await app.request('/oauth-client-metadata.json')).json()).toEqual({
      client_id: 'http://localhost',
    })
    expect(await (await app.request('/oauth/jwks.json')).json()).toEqual({ keys: [] })
  })
})

describe('GET /oauth/login', () => {
  it('redirects to the authorization URL with the app scope', async () => {
    const { app, auth } = await setup()
    const res = await app.request('/oauth/login?identifier=alice.test')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://pds.test/oauth/authorize?request_uri=x')
    expect(auth.oauth.authorize).toHaveBeenCalledWith('alice.test', { scope: auth.scope })
  })

  it('sends the user back to the login page without an identifier', async () => {
    const { app } = await setup()
    const res = await app.request('/oauth/login')
    expect(res.headers.get('location')).toMatch(/^\/login\?error=/)
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
})

describe('GET /oauth/callback', () => {
  it('sets an HttpOnly, SameSite=Lax session cookie and redirects home', async () => {
    const { app } = await setup()
    const res = await app.request('/oauth/callback?code=abc&state=xyz')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('creates a space account when the granted scope allows spaces', async () => {
    const { app } = await setup()
    const cookie = await signIn(app)
    const me = (await (await app.request('/api/me', { headers: { cookie } })).json()) as {
      storageMode: string
    }
    expect(me).toMatchObject({ did: 'did:plc:alice', handle: 'alice.test', storageMode: 'space' })
  })

  it('creates a local account when the PDS dropped the space permissions', async () => {
    const oauth = fakeOAuth({
      callback: vi.fn(async () => ({ session: fakeSession('did:plc:alice', 'atproto') })),
    })
    const { app } = await setup({ oauth })
    const cookie = await signIn(app)
    const me = (await (await app.request('/api/me', { headers: { cookie } })).json()) as {
      storageMode: string
    }
    expect(me.storageMode).toBe('local')
  })

  it('explains the failure when a space account loses spaces support', async () => {
    const { app, db } = await setup()
    await signIn(app)
    const oauth = fakeOAuth({
      callback: vi.fn(async () => ({ session: fakeSession('did:plc:alice', 'atproto') })),
    })
    const again = createApp({
      config: testConfig(),
      db,
      logger: pino({ level: 'silent' }),
      auth: authDeps(db, { oauth }),
    })
    const res = await again.request('/oauth/callback?code=abc&state=xyz')
    expect(decodeURIComponent(res.headers.get('location') ?? '')).toContain(
      new SpacesLostError().message,
    )
  })
})

describe('API session handling', () => {
  it('returns 401 from /api/me without a session', async () => {
    const { app } = await setup()
    expect((await app.request('/api/me')).status).toBe(401)
  })

  it('includes the user roles in /api/me', async () => {
    const { app } = await setup()
    const cookie = await signIn(app)
    const me = (await (await app.request('/api/me', { headers: { cookie } })).json()) as {
      roles: string[]
    }
    expect(me.roles).toEqual(['user', 'staff'])
  })

  it('refuses a non-GET API request with a foreign Origin', async () => {
    const { app } = await setup()
    const cookie = await signIn(app)
    const res = await app.request('/api/logout', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.test' },
    })
    expect(res.status).toBe(403)
  })

  it('refuses a non-GET API request with no Origin', async () => {
    const { app } = await setup()
    expect((await app.request('/api/logout', { method: 'POST' })).status).toBe(403)
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
