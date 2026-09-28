import { definePlugin } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createApp } from '../../src/app.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { loadPlugins } from '../../src/plugins/host.ts'
import { SecretBox } from '../../src/secrets.ts'
import { authDeps, loginCookie, ORIGIN, sessionCookie } from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'

const logger = pino({ level: 'silent' })
const search = definePlugin({
  id: 'search',
  name: 'Search',
  apiVersion: 1,
  userSettings: z.object({
    engine: z.string().default('duckduckgo'),
    apiKey: z.string().default('').meta({ secret: true }),
  }),
  setup: () => {},
})

async function setup() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const box = new SecretBox(Buffer.alloc(32, 3))
  const host = await loadPlugins(
    [search, definePlugin({ id: 'plain', name: 'Plain', apiVersion: 1, setup: () => {} })],
    {
      services: {} as never,
      logger,
      app: { name: 'Test', publicUrl: ORIGIN },
    },
  )
  const app = createApp({
    config: testConfig(),
    db,
    logger,
    auth: authDeps(db),
    plugins: { db, box, host },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
  return { app, db, cookie }
}

type Settings = {
  plugins: {
    id: string
    values: Record<string, unknown>
    secretsSet: string[]
    error: string | null
    schema: object
  }[]
}

describe('plugin settings API', () => {
  it('requires a signed-in user', async () => {
    const { app } = await setup()
    expect((await app.request('/api/plugins/settings')).status).toBe(401)
  })

  it('lists only plugins with user settings, with a JSON schema for the form', async () => {
    const { app, cookie } = await setup()
    const body = (await (
      await app.request('/api/plugins/settings', { headers: { cookie } })
    ).json()) as Settings
    expect(body.plugins.map((plugin) => plugin.id)).toEqual(['search'])
    expect(body.plugins[0]?.schema).toMatchObject({ type: 'object' })
  })

  it('refuses settings that are not a JSON object', async () => {
    const { app, cookie } = await setup()
    const put = await app.request('/api/plugins/search/settings', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(['kagi']),
    })
    expect(put.status).toBe(400)
  })

  it('saves settings and never returns secret values', async () => {
    const { app, cookie } = await setup()
    const put = await app.request('/api/plugins/search/settings', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ engine: 'kagi', apiKey: 'sk-secret' }),
    })
    expect(put.status).toBe(200)
    const body = (await (
      await app.request('/api/plugins/settings', { headers: { cookie } })
    ).json()) as Settings
    expect(body.plugins[0]).toMatchObject({
      values: { engine: 'kagi', apiKey: '' },
      secretsSet: ['apiKey'],
    })
    expect(JSON.stringify(body)).not.toContain('sk-secret')
  })

  it('rejects invalid settings with 400', async () => {
    const { app, cookie } = await setup()
    const res = await app.request('/api/plugins/search/settings', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ engine: 42 }),
    })
    expect(res.status).toBe(400)
  })

  it('reports invalid stored settings with an error instead of failing, and resets them on delete', async () => {
    const { app, cookie, db } = await setup()
    await db
      .insertInto('plugin_user_settings')
      .values({
        did: 'did:plc:alice',
        plugin_id: 'search',
        values_json: '{"engine":42}',
        secrets_encrypted: null,
        updated_at: 'now',
      })
      .execute()
    const broken = (await (
      await app.request('/api/plugins/settings', { headers: { cookie } })
    ).json()) as Settings
    expect(broken.plugins[0]?.error).toMatch(/invalid/)
    await app.request('/api/plugins/search/settings', {
      method: 'DELETE',
      headers: { cookie, origin: ORIGIN },
    })
    const reset = (await (
      await app.request('/api/plugins/settings', { headers: { cookie } })
    ).json()) as Settings
    expect(reset.plugins[0]).toMatchObject({ error: null, values: { engine: 'duckduckgo' } })
  })

  it('returns 404 for a plugin without user settings', async () => {
    const { app, cookie } = await setup()
    const res = await app.request('/api/plugins/plain/settings', {
      method: 'DELETE',
      headers: { cookie, origin: ORIGIN },
    })
    expect(res.status).toBe(404)
  })
})
