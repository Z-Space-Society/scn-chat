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
  setup: (ctx) =>
    ctx.tools.register({
      name: 'web_search',
      description: 'Search the web',
      inputSchema: z.object({}) as never,
      run: async () => 'results',
      userToggle: true,
    }),
})

/** A plugin with no user settings: one tool users may switch, and one they may not. */
const fetcher = definePlugin({
  id: 'fetcher',
  name: 'Fetcher',
  apiVersion: 1,
  setup: (ctx) => {
    ctx.tools.register({
      name: 'web_fetch',
      description: 'Fetch a page',
      inputSchema: z.object({}) as never,
      run: async () => 'page',
      defaultEnabled: true,
      userToggle: true,
    })
    ctx.tools.register({
      name: 'forced',
      description: 'Always on',
      inputSchema: z.object({}) as never,
      run: async () => 'on',
      defaultEnabled: true,
    })
  },
})

const forcedOnly = definePlugin({
  id: 'forced-only',
  name: 'Forced only',
  apiVersion: 1,
  setup: (ctx) =>
    ctx.tools.register({
      name: 'clock',
      description: 'Tell the time',
      inputSchema: z.object({}) as never,
      run: async () => 'noon',
      defaultEnabled: true,
    }),
})

async function setup() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const box = new SecretBox(Buffer.alloc(32, 3))
  const host = await loadPlugins(
    [
      search,
      fetcher,
      forcedOnly,
      definePlugin({ id: 'plain', name: 'Plain', apiVersion: 1, setup: () => {} }),
    ],
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
    plugins: { db, box, host: () => host },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
  return { app, db, cookie }
}

type Settings = {
  plugins: {
    id: string
    tools: { name: string; description: string; enabled: boolean; userToggle: boolean }[]
    values: Record<string, unknown>
    secretsSet: string[]
    error: string | null
    schema: object | null
  }[]
}

async function settings(app: Awaited<ReturnType<typeof setup>>['app'], cookie: string) {
  return (await (
    await app.request('/api/plugins/settings', { headers: { cookie } })
  ).json()) as Settings
}

async function switchTool(
  app: Awaited<ReturnType<typeof setup>>['app'],
  cookie: string,
  path: string,
  enabled: unknown,
) {
  return app.request(`/api/plugins/${path}`, {
    method: 'PUT',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

describe('plugin settings API', () => {
  it('requires a signed-in user', async () => {
    const { app } = await setup()
    expect((await app.request('/api/plugins/settings')).status).toBe(401)
  })

  it('lists plugins with user settings or switchable tools, with a JSON schema for the form', async () => {
    const { app, cookie } = await setup()
    const body = await settings(app, cookie)
    expect(body.plugins.map((plugin) => plugin.id)).toEqual(['search', 'fetcher'])
    expect(body.plugins[0]?.schema).toMatchObject({ type: 'object' })
    expect(body.plugins[1]?.schema).toBeNull()
  })

  it("lists each plugin's tools with their enabled state and whether users may switch them", async () => {
    const { app, cookie } = await setup()
    const fetcherEntry = (await settings(app, cookie)).plugins.find((p) => p.id === 'fetcher')
    expect(fetcherEntry?.tools).toEqual([
      { name: 'web_fetch', description: 'Fetch a page', enabled: true, userToggle: true },
      { name: 'forced', description: 'Always on', enabled: true, userToggle: false },
    ])
  })

  it("stores a user's tool choice", async () => {
    const { app, cookie } = await setup()
    expect((await switchTool(app, cookie, 'fetcher/tools/web_fetch', false)).status).toBe(200)
    const fetcherEntry = (await settings(app, cookie)).plugins.find((p) => p.id === 'fetcher')
    expect(fetcherEntry?.tools[0]).toMatchObject({ name: 'web_fetch', enabled: false })
  })

  it('returns 404 for a tool that belongs to another plugin', async () => {
    const { app, cookie } = await setup()
    expect((await switchTool(app, cookie, 'search/tools/web_fetch', false)).status).toBe(404)
  })

  it('returns 400 for a tool users may not switch', async () => {
    const { app, cookie } = await setup()
    expect((await switchTool(app, cookie, 'fetcher/tools/forced', false)).status).toBe(400)
  })

  it("keeps tool choices when the plugin's settings are reset", async () => {
    const { app, cookie } = await setup()
    await switchTool(app, cookie, 'search/tools/web_search', true)
    await app.request('/api/plugins/search/settings', {
      method: 'DELETE',
      headers: { cookie, origin: ORIGIN },
    })
    const searchEntry = (await settings(app, cookie)).plugins.find((p) => p.id === 'search')
    expect(searchEntry?.tools[0]).toMatchObject({ name: 'web_search', enabled: true })
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
    expect(broken.plugins[0]?.error).toBeTruthy()
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
