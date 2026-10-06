import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { Hono } from 'hono'
import { Kysely, SqliteDialect } from 'kysely'
import pino from 'pino'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp, inProcessFetch, type WebContext } from '../src/app.ts'
import type { Db } from '../src/db/index.ts'
import { migrateToLatest } from '../src/db/migrate.ts'
import type { Database } from '../src/db/schema.ts'
import type { AppEnv } from '../src/env.ts'
import { SettingsStore } from '../src/settings/store.ts'
import { testConfig } from './helpers/config.ts'
import { createSqliteDb, dialects } from './helpers/db.ts'
import { pdsError } from './helpers/pds-errors.ts'

const config = testConfig()
const logger = pino({ level: 'silent' })
const named = (db: Db, appName: string) => new SettingsStore(db, logger, { general: { appName } })

describe.each(dialects)('GET /api/health on $name', ({ create }) => {
  it('returns 200 with the app name when the database is reachable', async () => {
    const db = create()
    const res = await createApp({ config, db, logger, settings: named(db, 'Test Chat') }).request(
      '/api/health',
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', appName: 'Test Chat' })
    await db.destroy()
  })
})

describe('GET /api/health', () => {
  it('returns 503 when the database query fails', async () => {
    const sqlite = new SqliteDatabase(':memory:')
    const db: Db = new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) })
    sqlite.close()
    const res = await createApp({ config, db, logger }).request('/api/health')
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ status: 'error' })
  })
})

describe('web app serving', () => {
  const assets = mkdtempSync(join(tmpdir(), 'scn-web-'))
  writeFileSync(join(assets, 'app.js'), 'console.log(1)')
  afterAll(() => rmSync(assets, { recursive: true, force: true }))
  const db = createSqliteDb()
  const rendered: { path: string; context: WebContext }[] = []
  const web = {
    assets,
    fetch: async (request: Request, context: WebContext) => {
      rendered.push({ path: new URL(request.url).pathname, context })
      return new Response('<title>page</title>', { headers: { 'content-type': 'text/html' } })
    },
  }
  const app = createApp({ config, db, logger, settings: named(db, 'Test Chat'), web })

  it('serves built assets', async () => {
    const res = await app.request('/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('hands other paths to the web app with the app name', async () => {
    const res = await app.request('/chat/some-chat')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<title>page</title>')
    expect(rendered.at(-1)).toMatchObject({
      path: '/chat/some-chat',
      context: { appName: 'Test Chat' },
    })
  })

  it('lets the web app call the API in process', async () => {
    await app.request('/settings')
    const { fetch } = rendered.at(-1)!.context
    const res = await fetch('/api/health')
    expect(await res.json()).toEqual({ status: 'ok', appName: 'Test Chat' })
  })

  it('shows a renamed app without a restart', async () => {
    const migrated = createSqliteDb()
    await migrateToLatest(migrated)
    const settings = named(migrated, 'Before')
    const app = createApp({ config, db: migrated, logger, settings, web })
    await settings.set('general', { appName: 'After' }, 'did:plc:admin')
    await app.request('/')
    expect(rendered.at(-1)?.context.appName).toBe('After')
    expect(await (await app.request('/api/health')).json()).toMatchObject({ appName: 'After' })
  })

  it('returns 404 for unknown API paths', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'NotFound' })
  })
})

describe('inProcessFetch', () => {
  const echo = new Hono<AppEnv>().get('/api/echo', (c) =>
    c.json({ url: c.req.url, cookie: c.req.header('cookie') ?? null }),
  )

  it('resolves paths against the page request and sends its cookie', async () => {
    const page = new Request('https://chat.example/settings', {
      headers: { cookie: 'session=abc' },
    })
    const res = await inProcessFetch(echo, page)('/api/echo')
    expect(await res.json()).toEqual({
      url: 'https://chat.example/api/echo',
      cookie: 'session=abc',
    })
  })

  it('sends no cookie when the page request had none', async () => {
    const res = await inProcessFetch(echo, new Request('https://chat.example/'))('/api/echo')
    expect(await res.json()).toMatchObject({ cookie: null })
  })
})

describe('error responses', () => {
  /** An app with a route that throws the error, and the log lines it writes. */
  function throwing(err: unknown, nodeEnv: 'development' | 'production' = 'production') {
    const lines: Record<string, unknown>[] = []
    const logger = pino(
      { level: 'info' },
      { write: (line: string) => lines.push(JSON.parse(line)) },
    )
    const app = createApp({ config: { ...config, nodeEnv }, db: createSqliteDb(), logger })
    app.get('/boom', () => {
      throw err
    })
    return { request: () => app.request('/boom'), lines }
  }

  it('gives an unexpected error a reference that matches its log line, without its details', async () => {
    const { request, lines } = throwing(new Error('table secret_stuff is locked'))
    const res = await request()
    const body = (await res.json()) as { error: string; message: string }
    expect(res.status).toBe(500)
    expect(body.error).toBe('InternalServerError')
    expect(body.message).not.toContain('secret_stuff')
    const reference = /reference ([0-9a-f]{8})/.exec(body.message)?.[1]
    expect(lines.find((line) => line.msg === 'unhandled error')?.reference).toBe(reference)
  })

  it("includes the error's redacted message in development", async () => {
    const { request } = throwing(new Error('table busy, key sk-live-abcdef123456'), 'development')
    const body = (await (await request()).json()) as { message: string }
    expect(body.message).toContain('table busy')
    expect(body.message).not.toContain('sk-live-abcdef123456')
  })

  it('tells the user to sign in again when their session lacks a PDS scope', async () => {
    const { request, lines } = throwing(
      pdsError(403, 'ScopeMissingError', 'Missing required scope'),
    )
    const res = await request()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'ScopeMissing' })
    expect(lines.find((line) => line.msg === 'a PDS call failed')).toBeDefined()
  })
})
