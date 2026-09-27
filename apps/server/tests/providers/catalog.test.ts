import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { createRoles } from '../../src/auth/roles.ts'
import type { ModelConfig } from '../../src/config.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { Registry } from '../../src/plugins/registry.ts'
import {
  ModelCatalog,
  ModelUnavailable,
  ProviderConfigError,
  validateAdminModels,
} from '../../src/providers/catalog.ts'
import { saveCredential } from '../../src/providers/user-credentials.ts'
import { SecretBox } from '../../src/secrets.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { fakeProvider } from '../helpers/providers.ts'

const caps = { vision: true, reasoning: true, tools: true }
const model = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
  provider: 'fake',
  id: 'big',
  name: 'Big',
  capabilities: caps,
  roles: ['user'],
  ...overrides,
})
const roles = createRoles({ staff: ['did:plc:staff'] })
const guardedFetch = (async () => new Response()) as unknown as typeof fetch

function registryWith(...providers: ReturnType<typeof fakeProvider>['provider'][]) {
  const registry = new Registry<(typeof providers)[number]>('provider', (p) => p.id)
  for (const provider of providers) registry.register(provider, 'test')
  return registry
}

describe('validateAdminModels', () => {
  const registry = registryWith(
    fakeProvider().provider,
    fakeProvider({ id: 'keyless', hasAdminKey: false }).provider,
  )

  it('accepts valid models', () => {
    expect(validateAdminModels([model()], registry, roles)).toHaveLength(1)
  })

  it.each([
    ['an unregistered provider', model({ provider: 'nope' }), /no plugin registered/],
    ['a provider without an admin key', model({ provider: 'keyless' }), /no admin key/],
    ['missing roles', model({ roles: undefined as never }), /must list the roles/],
    ['empty roles', model({ roles: [] }), /must list the roles/],
    ['an undefined role', model({ roles: ['vip'] }), /undefined role "vip"/],
  ])('fails for %s', (_name, bad, message) => {
    expect(() => validateAdminModels([bad], registry, roles)).toThrow(message)
  })

  it('fails when more than one model is marked default', () => {
    expect(() =>
      validateAdminModels(
        [model({ default: true }), model({ id: 'b', default: true })],
        registry,
        roles,
      ),
    ).toThrow(ProviderConfigError)
  })
})

async function catalogWith(
  adminModels: ModelConfig[],
  ...providers: ReturnType<typeof fakeProvider>['provider'][]
) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const box = new SecretBox(Buffer.alloc(32, 4))
  const registry = registryWith(...providers)
  return {
    db,
    box,
    catalog: new ModelCatalog({
      db,
      box,
      providers: registry,
      adminModels,
      roles,
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
    expect(catalog.defaultModel()).toEqual({ provider: 'fake', id: 'big' })
  })
})
