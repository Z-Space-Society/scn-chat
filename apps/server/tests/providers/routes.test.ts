import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { createRoles } from '../../src/auth/roles.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { Registry } from '../../src/plugins/registry.ts'
import { ModelCatalog } from '../../src/providers/catalog.ts'
import { SecretBox } from '../../src/secrets.ts'
import { authDeps, loginCookie, ORIGIN, sessionCookie } from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { fakeProvider } from '../helpers/providers.ts'

const caps = { vision: false, reasoning: false, tools: false }

async function setup() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const box = new SecretBox(Buffer.alloc(32, 6))
  const logger = pino({ level: 'silent' })
  const providers = new Registry<ReturnType<typeof fakeProvider>['provider']>(
    'provider',
    (p) => p.id,
  )
  providers.register(
    fakeProvider({
      listModels: vi.fn(async () => [{ id: 'listed', name: 'Listed', capabilities: caps }]),
    }).provider,
    't',
  )
  providers.register(fakeProvider({ id: 'adminonly', userKeys: false }).provider, 't')
  const guardedFetch = (async () => new Response()) as unknown as typeof fetch
  const catalog = new ModelCatalog({
    db,
    box,
    providers,
    adminModels: [
      {
        provider: 'fake',
        id: 'big',
        name: 'Big',
        capabilities: caps,
        roles: ['user'],
        default: true,
      },
    ],
    roles: createRoles(),
    guardedFetch,
    logger,
  })
  const app = createApp({
    config: testConfig(),
    db,
    logger,
    auth: authDeps(db),
    providers: { db, box, catalog, providers, guardedFetch, logger },
  })
  const cookie = sessionCookie(await app.request('/oauth/callback?code=a&state=b', loginCookie))
  const call = async (method: string, path: string, body?: object) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  return { call, app, cookie }
}

describe('provider routes', () => {
  it('lists the models the user may use and the default model', async () => {
    const { call } = await setup()
    const { body } = await call('GET', '/models')
    expect(body).toMatchObject({
      models: [{ provider: 'fake', id: 'big', source: 'admin' }],
      defaultModel: { provider: 'fake', id: 'big' },
    })
  })

  it('lists only providers that accept user keys', async () => {
    const { call } = await setup()
    const { body } = await call('GET', '/providers')
    expect(body.providers).toMatchObject([{ id: 'fake', listsModels: true }])
  })

  it('adds a credential, shows its models, and never returns the key', async () => {
    const { call } = await setup()
    const created = await call('POST', '/credentials', {
      providerId: 'fake',
      apiKey: 'sk-secret-7777',
      models: [{ id: 'mine', name: 'Mine', capabilities: caps }],
    })
    expect(created.status).toBe(201)
    const list = await call('GET', '/credentials')
    expect(list.body.credentials).toMatchObject([{ keyHint: '7777' }])
    expect(JSON.stringify(list.body)).not.toContain('sk-secret')
    expect(
      ((await call('GET', '/models')).body.models as { id: string }[]).map((m) => m.id),
    ).toContain('mine')
  })

  it('refuses a credential for a provider without user keys', async () => {
    const { call } = await setup()
    expect(
      (await call('POST', '/credentials', { providerId: 'adminonly', apiKey: 'k' })).status,
    ).toBe(400)
  })

  it('rejects a key that covers no models', async () => {
    const { call } = await setup()
    const res = await call('POST', '/credentials', { providerId: 'fake', apiKey: 'k', models: [] })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/at least one model/)
  })

  it('rejects a credential body that is not JSON', async () => {
    const { app, cookie } = await setup()
    const res = await app.request('/api/credentials', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: '{',
    })
    expect(res.status).toBe(400)
  })

  it('deletes a credential', async () => {
    const { call } = await setup()
    const { body } = await call('POST', '/credentials', {
      providerId: 'fake',
      apiKey: 'k',
      models: [
        { id: 'm', name: 'M', capabilities: { vision: false, reasoning: false, tools: false } },
      ],
    })
    const id = (body.credential as { id: string }).id
    expect((await call('DELETE', `/credentials/${id}`)).status).toBe(200)
    expect((await call('GET', '/credentials')).body.credentials).toEqual([])
  })

  it('lists a provider models with a pasted key', async () => {
    const { call } = await setup()
    const { body } = await call('POST', '/providers/fake/list-models', { apiKey: 'k' })
    expect(body.models).toMatchObject([{ id: 'listed' }])
  })
})
