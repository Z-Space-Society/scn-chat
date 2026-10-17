import { Server } from 'node:http'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp, type WebContext } from '../src/app.ts'
import { migrateToLatest } from '../src/db/migrate.ts'
import { SettingsStore } from '../src/settings/store.ts'
import { type DevWeb, loadDevWeb } from '../src/web.ts'
import { authDeps } from './helpers/auth.ts'
import { testConfig } from './helpers/config.ts'
import { createSqliteDb } from './helpers/db.ts'

const logger = pino({ level: 'silent' })

/** A signed-in user, as /api/me answers for them. */
const me = (changes: Record<string, unknown> = {}) => ({
  did: 'did:plc:alice',
  handle: 'alice.test',
  storageMode: 'local',
  backgroundSync: true,
  roles: ['user'],
  admin: false,
  access: 'full',
  accessMessage: null,
  ...changes,
})

/**
 * The web app rendered on the server through Vite's SSR runner, as `pnpm dev` serves it, so each
 * request runs the routes' server-side `beforeLoad`.
 */
describe('server-rendered pages', () => {
  let dev: DevWeb
  beforeAll(async () => {
    dev = await loadDevWeb(new Server(), { reactScan: false })
  }, 120_000)
  afterAll(() => dev?.close())

  /**
   * Request a page as Hono hands it to Start, with /api/me answering for the given user, or
   * signed out without one.
   */
  function requestAs(user: ReturnType<typeof me> | null, path: string) {
    const fetch: WebContext['fetch'] = async (input) => {
      if (String(input) !== '/api/me') return Response.json({})
      return user ? Response.json(user) : Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return dev.web.fetch(new Request(`http://localhost${path}`), {
      appName: 'Test Chat',
      description: 'Chats on your PDS.',
      publicUrl: 'https://chat.example',
      fetch,
    })
  }

  describe('through the server', () => {
    const db = createSqliteDb()
    const settings = new SettingsStore(db, logger, {
      general: { appName: 'Test Chat', description: 'Chats on your PDS.' },
    })
    beforeAll(() => migrateToLatest(db))
    afterAll(() => db.destroy())
    const request = (path: string) =>
      createApp({
        config: testConfig(),
        db,
        logger,
        settings,
        auth: authDeps(db),
        web: dev.web,
      }).request(path)

    it.each(['/', '/chat/abc', '/settings', '/admin/users'])(
      'redirects a signed-out request for %s to /login before rendering',
      async (path) => {
        const res = await request(path)
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('/login')
        expect(await res.text()).toBe('')
      },
    )

    it('titles the page with the configured app name', async () => {
      const res = await request('/login')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('<title>Test Chat</title>')
      expect(html).toContain('<meta name="application-name" content="Test Chat"/>')
    })
  })

  it('lets search engines list the login page, under the public URL, with the description', async () => {
    const html = await (await requestAs(null, '/login')).text()
    expect(html).toContain('<meta name="description" content="Chats on your PDS."/>')
    expect(html).toContain('<meta property="og:title" content="Test Chat"/>')
    expect(html).toContain('<meta name="robots" content="index, follow"/>')
    expect(html).not.toContain('content="noindex"')
    expect(html).toContain('<link rel="canonical" href="https://chat.example/login"/>')
    expect(html).toContain('Chats on your PDS.</p>')
  })

  it("keeps someone's own pages out of search engines, titled by page", async () => {
    const html = await (await requestAs(me(), '/settings')).text()
    expect(html).toContain('<meta name="robots" content="noindex"/>')
    expect(html).toContain('<title>Preferences · Settings · Test Chat</title>')
    expect(html).toContain(
      '<meta property="og:title" content="Preferences · Settings · Test Chat"/>',
    )
  })

  it.each(['/chat/abc', '/settings'])(
    'redirects a viewer requesting %s to /login before rendering',
    async (path) => {
      const res = await requestAs(me({ access: 'viewer' }), path)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('/login')
      expect(await res.text()).toBe('')
    },
  )

  it.each(['/admin', '/admin/roles', '/admin/models'])(
    'redirects a user who is not an admin requesting %s to / before rendering',
    async (path) => {
      const res = await requestAs(me(), path)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toBe('/')
      expect(await res.text()).toBe('')
    },
  )

  it('renders the admin area for an admin', async () => {
    const res = await requestAs(me({ admin: true }), '/admin/roles')
    expect(res.status).toBe(200)
  })
})
