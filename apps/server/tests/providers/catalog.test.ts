import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { Registry } from '../../src/plugins/registry.ts'
import { type AdminModel, saveAdminModel } from '../../src/providers/admin-models.ts'
import { ModelCatalog, ModelUnavailable } from '../../src/providers/catalog.ts'
import { saveCredential } from '../../src/providers/user-credentials.ts'
import { SecretBox } from '../../src/secrets.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { fakeProvider } from '../helpers/providers.ts'

const caps = { vision: true, reasoning: true, tools: true }
const model = (overrides: Partial<AdminModel> = {}): AdminModel => ({
  provider: 'fake',
  id: 'big',
  name: 'Big',
  capabilities: caps,
  roles: ['user'],
  default: false,
  ...overrides,
})
const rolesOf = async (did: string) => (did === 'did:plc:staff' ? ['user', 'staff'] : ['user'])
const guardedFetch = (async () => new Response()) as unknown as typeof fetch

function registryWith(...providers: ReturnType<typeof fakeProvider>['provider'][]) {
  const registry = new Registry<(typeof providers)[number]>('provider', (p) => p.id)
  for (const provider of providers) registry.register(provider, 'test')
  return registry
}

async function catalogWith(
  adminModels: AdminModel[],
  ...providers: ReturnType<typeof fakeProvider>['provider'][]
) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  for (const adminModel of adminModels) await saveAdminModel(db, adminModel, 'did:plc:admin')
  const box = new SecretBox(Buffer.alloc(32, 4))
  const registry = registryWith(...providers)
  return {
    db,
    box,
    catalog: new ModelCatalog({
      db,
      box,
      providers: registry,
      rolesOf,
      guardedFetch,
      logger: pino({ level: 'silent' }),
    }),
  }
}

describe('ModelCatalog.resolve', () => {
  it('uses the user key when the user has one for the model', async () => {
    const { provider, created } = fakeProvider()
    const { db, box, catalog } = await catalogWith([model()], provider)
    await saveCredential(db, box, 'did:plc:alice', provider, {
      apiKey: 'sk-user',
      models: [{ id: 'big', name: 'Big', capabilities: caps }],
    })
    await catalog.resolve('did:plc:alice', { provider: 'fake', id: 'big' })
    expect(created[0]).toMatchObject({ modelId: 'big', apiKey: 'sk-user' })
  })

  it('falls back to the admin key when a user role allows the model', async () => {
    const { provider, created } = fakeProvider()
    const { catalog } = await catalogWith([model()], provider)
    const resolved = await catalog.resolve('did:plc:alice', { provider: 'fake', id: 'big' })
    expect(created[0]?.apiKey).toBeUndefined()
    expect(resolved.capabilities).toEqual(caps)
  })

  it('refuses an admin model the user roles do not allow, but allows the user own key for it', async () => {
    const { provider } = fakeProvider()
    const { db, box, catalog } = await catalogWith([model({ roles: ['staff'] })], provider)
    await expect(
      catalog.resolve('did:plc:alice', { provider: 'fake', id: 'big' }),
    ).rejects.toBeInstanceOf(ModelUnavailable)
    await expect(
      catalog.resolve('did:plc:staff', { provider: 'fake', id: 'big' }),
    ).resolves.toBeDefined()
    await saveCredential(db, box, 'did:plc:alice', provider, {
      apiKey: 'sk-user',
      models: [{ id: 'big', name: 'Big', capabilities: caps }],
    })
    await expect(
      catalog.resolve('did:plc:alice', { provider: 'fake', id: 'big' }),
    ).resolves.toBeDefined()
  })

  it('fails with ModelUnavailable naming the model', async () => {
    const { catalog } = await catalogWith([], fakeProvider().provider)
    await expect(
      catalog.resolve('did:plc:alice', { provider: 'fake', id: 'ghost' }),
    ).rejects.toThrow(/fake\/ghost/)
  })

  it('reaches a user endpoint by its slug through the guarded fetch', async () => {
    const { provider, created } = fakeProvider({
      id: 'custom',
      userEndpoints: true,
      hasAdminKey: false,
    })
    const { db, box, catalog } = await catalogWith([], provider)
    await saveCredential(db, box, 'did:plc:alice', provider, {
      apiKey: 'sk-mine',
      slug: 'my-ollama',
      baseUrl: 'https://ollama.example.com/v1',
      models: [{ id: 'llama', name: 'Llama', capabilities: caps }],
    })
    await catalog.resolve('did:plc:alice', { provider: 'user:my-ollama', id: 'llama' })
    expect(created[0]).toMatchObject({
      baseURL: 'https://ollama.example.com/v1',
      fetch: guardedFetch,
    })
  })

  it('skips the guard for providers that allow private networks', async () => {
    const { provider, created } = fakeProvider({
      id: 'local',
      userEndpoints: true,
      allowPrivateNetworks: true,
    })
    const { db, box, catalog } = await catalogWith([], provider)
    await saveCredential(db, box, 'did:plc:alice', provider, {
      apiKey: 'k',
      slug: 'home',
      baseUrl: 'http://192.168.1.5:11434/v1',
      models: [{ id: 'qwen', name: 'Qwen', capabilities: caps }],
    })
    await catalog.resolve('did:plc:alice', { provider: 'user:home', id: 'qwen' })
    expect(created[0]?.fetch).toBeUndefined()
  })
})

describe('ModelCatalog.listForUser', () => {
  it('lists allowed admin models and the user own models', async () => {
    const { provider } = fakeProvider()
    const { db, box, catalog } = await catalogWith(
      [model({ default: true }), model({ id: 'secret', roles: ['staff'] })],
      provider,
    )
    await saveCredential(db, box, 'did:plc:alice', provider, {
      apiKey: 'k',
      models: [{ id: 'mine', name: 'Mine', capabilities: caps }],
    })
    const models = await catalog.listForUser('did:plc:alice')
    expect(models.map((m) => `${m.source}:${m.id}`)).toEqual(['admin:big', 'user:mine'])
    expect(await catalog.defaultModel()).toEqual({ provider: 'fake', id: 'big' })
  })

  it('hides admin models whose provider is not loaded or has no admin key', async () => {
    const { catalog } = await catalogWith(
      [
        model({ provider: 'ghost', default: true }),
        model({ provider: 'keyless', id: 'k' }),
        model({ id: 'ok' }),
      ],
      fakeProvider().provider,
      fakeProvider({ id: 'keyless', hasAdminKey: false }).provider,
    )
    const models = await catalog.listForUser('did:plc:alice')
    expect(models.map((m) => `${m.provider}/${m.id}`)).toEqual(['fake/ok'])
    expect(await catalog.defaultModel()).toBeUndefined()
  })

  it('applies a model change on the next call', async () => {
    const { db, catalog } = await catalogWith([], fakeProvider().provider)
    expect(await catalog.listForUser('did:plc:alice')).toEqual([])
    await saveAdminModel(db, model(), 'did:plc:admin')
    expect((await catalog.listForUser('did:plc:alice')).map((m) => m.id)).toEqual(['big'])
  })
})
