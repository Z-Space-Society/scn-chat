import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import pino from 'pino'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
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

describe('production static serving', () => {
  const webDist = mkdtempSync(join(tmpdir(), 'scn-web-'))
  writeFileSync(join(webDist, 'index.html'), '<!doctype html><title>index</title>')
  writeFileSync(join(webDist, 'app.js'), 'console.log(1)')
  afterAll(() => rmSync(webDist, { recursive: true, force: true }))
  const db = createSqliteDb()
  const app = createApp({ config, db, logger, webDist })

  it('serves built files', async () => {
    const res = await app.request('/app.js')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('console.log(1)')
  })

  it('falls back to index.html for unknown non-API paths', async () => {
    const res = await app.request('/c/some-chat')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>index</title>')
  })

  it('fills the app name into index.html, escaped', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'scn-web-'))
    writeFileSync(join(dist, 'index.html'), '<title>__APP_NAME__</title>')
    const named = createApp({
      config: { ...config, appName: 'Chat & <Co>' },
      db,
      logger,
      webDist: dist,
    })
    for (const path of ['/', '/index.html', '/c/some-chat']) {
      expect(await (await named.request(path)).text()).toBe(
        '<title>Chat &#38; &#60;Co&#62;</title>',
      )
    }
    rmSync(dist, { recursive: true, force: true })
  })

  it('returns 404 for unknown API paths', async () => {
    const res = await app.request('/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'NotFound' })
  })
})
