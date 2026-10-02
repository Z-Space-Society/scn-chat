import { definePlugin, type ModelProvider } from '@scn-chat/plugin-api'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { adminHarness } from '../helpers/admin.ts'
import { installedFrom } from '../helpers/plugins.ts'

const caps = { vision: true, reasoning: false, tools: true }

/** A provider plugin whose provider ID and admin key come from its options. */
function fixtures() {
  const closed: string[] = []
  const optionsSchema = z
    .object({
      id: z
        .string()
        .regex(/^[a-z]+$/)
        .default('fake'),
      apiKey: z.string().min(1).optional().meta({ secret: true }),
      crash: z.boolean().default(false),
    })
    .strict()
  const installed = installedFrom({
    'provider-plugin': {
      multiple: true,
      optionsSchema,
      factory: (options: z.infer<typeof optionsSchema>) =>
        definePlugin({
          id: `prov-${options.id}`,
          name: `Provider ${options.id}`,
          apiVersion: 1,
          setup(ctx) {
            if (options.crash) throw new Error('setup exploded')
            ctx.providers.register({
              id: options.id,
              name: options.id,
              hasAdminKey: Boolean(options.apiKey),
              userKeys: true,
              replay: 'drop',
              createModel: () => {
                throw new Error('not in these tests')
              },
              listModels: async ({ apiKey }) => [
                {
                  id: `listed-with-${apiKey ?? options.apiKey}`,
                  name: 'Listed',
                  capabilities: caps,
                },
              ],
            } as ModelProvider)
            ctx.onClose(() => void closed.push(options.id))
          },
        }),
    },
    'plain-plugin': {
      factory: () => definePlugin({ id: 'plain', name: 'Plain', apiVersion: 1, setup: () => {} }),
    },
  })
  return { installed, closed }
}

async function setup() {
  const { installed, closed } = fixtures()
  const h = await adminHarness({ installed })
  const instances = async () =>
    (await h.call('GET', '/admin/plugins')).body.instances as {
      id: string
      package: string
      status: string
      enabled: boolean
      options: Record<string, unknown>
      secretsSet: string[]
      pluginId: string | null
      error: string | null
    }[]
  const add = async (options: Record<string, unknown>, pkg = 'provider-plugin') =>
    h.call('POST', '/admin/plugins', { package: pkg, options })
  const model = (overrides: Record<string, unknown> = {}) => ({
    provider: 'fake',
    id: 'big',
    name: 'Big',
    capabilities: caps,
    roles: ['user'],
    ...overrides,
  })
  return { ...h, closed, instances, add, model }
}

describe('installed plugins', () => {
  it('lists each installed package with its form and secret fields', async () => {
    const h = await setup()
    const { plugins } = (await h.call('GET', '/admin/plugins/installed')).body as {
      plugins: { package: string; secretFields: string[] }[]
    }
    expect(plugins.map((p) => p.package)).toEqual(['provider-plugin', 'plain-plugin'])
    expect(plugins.map((p) => (p as { multiple?: boolean }).multiple)).toEqual([true, false])
    expect(plugins[0]?.secretFields).toEqual(['apiKey'])
  })
})

describe('plugin instances', () => {
  it('adds an instance and loads it without a restart', async () => {
    const h = await setup()
    expect((await h.add({ apiKey: 'sk-admin' })).status).toBe(201)
    expect(await h.instances()).toEqual([
      expect.objectContaining({ status: 'loaded', pluginId: 'prov-fake', secretsSet: ['apiKey'] }),
    ])
    expect(h.holder.current().host.providers.get('fake')?.hasAdminKey).toBe(true)
  })

  it('refuses options that fail the schema, pointing at the field', async () => {
    const h = await setup()
    const res = await h.add({ id: 'Not Valid' })
    expect(res.status).toBe(400)
    expect(res.body.issues).toEqual([expect.objectContaining({ path: ['id'] })])
    expect(await h.instances()).toEqual([])
  })

  it('refuses a package that is not installed', async () => {
    const h = await setup()
    expect((await h.add({}, 'nope-plugin')).status).toBe(400)
  })

  it('stores secret options encrypted and never returns them', async () => {
    const h = await setup()
    await h.add({ apiKey: 'sk-very-secret' })
    const [instance] = await h.instances()
    expect(JSON.stringify(instance)).not.toContain('sk-very-secret')
    const row = await h.db.selectFrom('plugin_instance').selectAll().executeTakeFirstOrThrow()
    expect(row.options_json).not.toContain('sk-very-secret')
    expect(row.secrets_encrypted).not.toContain('sk-very-secret')
  })

  it('keeps a stored secret when the form leaves it blank, and removes it on clear', async () => {
    const h = await setup()
    await h.add({ apiKey: 'sk-admin' })
    const [instance] = await h.instances()
    const id = instance?.id as string
    await h.call('PUT', `/admin/plugins/${id}`, { options: { id: 'fake', apiKey: '' } })
    expect((await h.instances())[0]?.secretsSet).toEqual(['apiKey'])
    expect(h.holder.current().host.providers.get('fake')?.hasAdminKey).toBe(true)
    await h.call('PUT', `/admin/plugins/${id}`, { clearSecrets: ['apiKey'] })
    expect((await h.instances())[0]?.secretsSet).toEqual([])
    expect(h.holder.current().host.providers.get('fake')?.hasAdminKey).toBe(false)
  })

  it('refuses an edit that would rename the plugin', async () => {
    const h = await setup()
    await h.add({})
    const id = (await h.instances())[0]?.id
    const res = await h.call('PUT', `/admin/plugins/${id}`, { options: { id: 'other' } })
    expect(res.status).toBe(400)
    expect((await h.instances())[0]?.options).toEqual({})
  })

  it('refuses a change whose setup throws, and leaves the running plugins alone', async () => {
    const h = await setup()
    await h.add({})
    const before = h.holder.current()
    const id = (await h.instances())[0]?.id
    const res = await h.call('PUT', `/admin/plugins/${id}`, { options: { crash: true } })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/setup exploded/)
    expect(h.holder.current()).toBe(before)
    expect((await h.instances())[0]?.options).toEqual({})
  })

  it('adds a package once unless it allows more than one instance', async () => {
    const h = await setup()
    expect((await h.add({}, 'plain-plugin')).status).toBe(201)
    expect((await h.add({}, 'plain-plugin')).status).toBe(400)
    expect((await h.add({ id: 'one' })).status).toBe(201)
    expect((await h.add({ id: 'two' })).status).toBe(201)
  })

  it('refuses a second instance with the same plugin or provider ID', async () => {
    const h = await setup()
    await h.add({})
    const res = await h.add({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/prov-fake/)
    expect(await h.instances()).toHaveLength(1)
  })

  it('disables an instance without losing its options, and enables it again', async () => {
    const h = await setup()
    await h.add({ id: 'kept' })
    const id = (await h.instances())[0]?.id
    await h.call('PUT', `/admin/plugins/${id}`, { enabled: false })
    expect((await h.instances())[0]).toMatchObject({ status: 'disabled', options: { id: 'kept' } })
    expect(h.holder.current().host.providers.get('kept')).toBeUndefined()
    await h.call('PUT', `/admin/plugins/${id}`, { enabled: true })
    expect(h.holder.current().host.providers.get('kept')).toBeDefined()
  })

  it('reorders instances, which changes the load order', async () => {
    const h = await setup()
    await h.add({ id: 'first' })
    await h.add({}, 'plain-plugin')
    const ids = (await h.instances()).map((i) => i.id)
    expect((await h.call('PUT', '/admin/plugins/order', { ids: ids.slice(0, 1) })).status).toBe(400)
    await h.call('PUT', '/admin/plugins/order', { ids: [...ids].reverse() })
    expect((await h.instances()).map((i) => i.package)).toEqual(['plain-plugin', 'provider-plugin'])
    expect(h.holder.current().host.plugins.map((p) => p.id)).toEqual(['plain', 'prov-first'])
  })

  it('removes an instance and keeps its users settings', async () => {
    const h = await setup()
    await h.add({})
    await h.db
      .insertInto('plugin_user_settings')
      .values({
        did: 'did:plc:alice',
        plugin_id: 'prov-fake',
        values_json: '{}',
        secrets_encrypted: null,
        updated_at: new Date().toISOString(),
      })
      .execute()
    const id = (await h.instances())[0]?.id
    expect((await h.call('DELETE', `/admin/plugins/${id}`)).status).toBe(200)
    expect(await h.instances()).toEqual([])
    expect(await h.db.selectFrom('plugin_user_settings').selectAll().execute()).toHaveLength(1)
    expect((await h.call('DELETE', `/admin/plugins/${id}`)).status).toBe(404)
  })

  it('closes a replaced runtime', async () => {
    const h = await setup()
    await h.add({ id: 'old' })
    const id = (await h.instances())[0]?.id
    await h.call('PUT', `/admin/plugins/${id}`, { enabled: false })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.closed).toEqual(['old'])
  })
})

describe('listing a provider plugin models', () => {
  it('uses the form options, with blank secrets from the stored instance, and closes the scratch plugin', async () => {
    const h = await setup()
    await h.add({ apiKey: 'sk-stored' })
    const id = (await h.instances())[0]?.id
    const stored = await h.call('POST', '/admin/plugins/list-models', {
      package: 'provider-plugin',
      instanceId: id,
      options: { id: 'fake', apiKey: '' },
    })
    expect(stored.body.models).toEqual([
      expect.objectContaining({ provider: 'fake', id: 'listed-with-sk-stored' }),
    ])
    const typed = await h.call('POST', '/admin/plugins/list-models', {
      package: 'provider-plugin',
      options: { id: 'draft', apiKey: 'sk-typed' },
    })
    expect(typed.body.models).toEqual([
      expect.objectContaining({ provider: 'draft', id: 'listed-with-sk-typed' }),
    ])
    expect(h.closed).toContain('draft')
  })
})

describe('admin models', () => {
  it('refuses a model with an unknown provider, a keyless provider, an undefined role, or no roles', async () => {
    const h = await setup()
    await h.add({}, 'provider-plugin')
    for (const bad of [
      h.model({ provider: 'ghost' }),
      h.model(),
      h.model({ roles: ['vip'] }),
      h.model({ roles: [] }),
    ]) {
      expect((await h.call('POST', '/admin/models', bad)).status).toBe(400)
    }
  })

  it('adds, changes, reorders, and removes models, with one default at most', async () => {
    const h = await setup()
    await h.add({ apiKey: 'k' })
    expect((await h.call('POST', '/admin/models', h.model({ default: true }))).status).toBe(201)
    expect((await h.call('POST', '/admin/models', h.model())).status).toBe(400)
    await h.call('POST', '/admin/models', h.model({ id: 'small', default: true }))
    const list = async () =>
      (
        (await h.call('GET', '/admin/models')).body.models as { id: string; default: boolean }[]
      ).map((m) => `${m.id}${m.default ? '*' : ''}`)
    expect(await list()).toEqual(['big', 'small*'])
    await h.call('PUT', '/admin/models', h.model({ name: 'Bigger', default: true }))
    expect(await list()).toEqual(['big*', 'small'])
    await h.call('PUT', '/admin/models/order', {
      models: [
        { provider: 'fake', id: 'small' },
        { provider: 'fake', id: 'big' },
      ],
    })
    expect(await list()).toEqual(['small', 'big*'])
    expect(
      (await h.call('DELETE', '/admin/models', { provider: 'fake', id: 'small' })).status,
    ).toBe(200)
    expect(await list()).toEqual(['big*'])
    expect((await h.call('PUT', '/admin/models', h.model({ id: 'gone' }))).status).toBe(404)
  })

  it('makes a new model available to users on the next request', async () => {
    const h = await setup()
    await h.add({ apiKey: 'k' })
    await h.call('POST', '/admin/models', h.model())
    expect(
      ((await h.call('GET', '/models')).body.models as { id: string }[]).map((m) => m.id),
    ).toEqual(['big'])
  })

  it('refuses to remove, disable, or clear the key of a provider that models use, naming them', async () => {
    const h = await setup()
    await h.add({ apiKey: 'k' })
    await h.call('POST', '/admin/models', h.model())
    const id = (await h.instances())[0]?.id
    for (const [method, body] of [
      ['DELETE', undefined],
      ['PUT', { enabled: false }],
      ['PUT', { clearSecrets: ['apiKey'] }],
    ] as const) {
      const res = await h.call(method, `/admin/plugins/${id}`, body)
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/fake\/big/)
    }
  })

  it('flags a model whose provider is not loaded, and hides it from users', async () => {
    const h = await setup()
    await h.add({ apiKey: 'k' })
    await h.call('POST', '/admin/models', h.model())
    await h.db.updateTable('admin_model').set({ provider: 'ghost' }).execute()
    const models = (await h.call('GET', '/admin/models')).body.models as {
      warning: string | null
    }[]
    expect(models[0]?.warning).toMatch(/ghost/)
    expect((await h.call('GET', '/models')).body.models).toEqual([])
  })
})
