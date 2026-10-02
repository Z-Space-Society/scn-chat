import pino from 'pino'
import { vi } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import type { InstalledPlugins } from '../../src/plugins/installed.ts'
import { createServer } from '../../src/server.ts'
import { fakeIdentity, fakeOAuth, fakeSession, LOGIN_STATE, loginCookie, ORIGIN } from './auth.ts'
import { TEST_ADMIN, testConfig } from './config.ts'
import { createSqliteDb } from './db.ts'
import { installedFrom } from './plugins.ts'

type Json = Record<string, unknown>

/** A whole server with TEST_ADMIN as its admin, and helpers to call it as any DID. */
export async function adminHarness(options: { installed?: InstalledPlugins } = {}) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  let signingIn = TEST_ADMIN
  const identity = fakeIdentity()
  const server = await createServer({
    config: testConfig(),
    db,
    logger: pino({ level: 'silent' }),
    installed: options.installed ?? installedFrom({}),
    oauth: fakeOAuth({
      callback: vi.fn(async () => ({
        session: fakeSession(signingIn, 'atproto'),
        state: LOGIN_STATE,
      })),
    }),
    identity,
    startBackgroundJobs: false,
  })
  const cookies = new Map<string, string>()
  /** Sign in as the DID, returning the redirect. Viewers come back through a share link. */
  const signIn = async (did: string, next?: string) => {
    signingIn = did
    const res = await server.app.request('/oauth/callback?code=a&state=b', {
      headers: {
        cookie: `${loginCookie.headers.cookie}${next ? `; scn_next=${encodeURIComponent(next)}` : ''}`,
      },
    })
    const match = (res.headers.get('set-cookie') ?? '').match(/scn_session=([^;]+)/)
    if (match) cookies.set(did, `scn_session=${match[1]}`)
    return res
  }
  /** Call the API as the DID, signing in first when needed. */
  const call = async (method: string, path: string, body?: unknown, as = TEST_ADMIN) => {
    if (!cookies.has(as)) await signIn(as)
    const res = await server.app.request(`/api${path}`, {
      method,
      headers: {
        cookie: cookies.get(as) ?? '',
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Json }
  }
  return { ...server, db, identity, signIn, call }
}
