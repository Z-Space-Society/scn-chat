import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import pino from 'pino'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp, type WebContext } from '../src/app.ts'
import type { Db } from '../src/db/index.ts'
import type { Database } from '../src/db/schema.ts'
import { testConfig } from './helpers/config.ts'
import { createSqliteDb, dialects } from './helpers/db.ts'

const config = testConfig()
const logger = pino({ level: 'silent' })

describe.each(dialects)('GET /api/health on $name', ({ create }) => {
  it('returns 200 with the app name when the database is reachable', async () => {
    const db = create()
    const res = await createApp({ config, db, logger }).request('/api/health')
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
  const app = createApp({
    config,
    db,
    logger,
    web: {
      assets,
      fetch: async (request, context) => {
        rendered.push({ path: new URL(request.url).pathname, context })
        return new Response('<title>page</title>', { headers: { 'content-type': 'text/html' } })
      },
    },
  })

  it('serves built assets', async () => {
    const res = await app.request('/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('hands other paths to the web app with the app name', async () => {
    const res = await app.request('/c/some-chat')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('<title>page</title>')
    expect(rendered.at(-1)).toEqual({ path: '/c/some-chat', context: { appName: 'Test Chat' } })
  })

  it('returns 404 for unknown API paths', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'NotFound' })
  })
})
