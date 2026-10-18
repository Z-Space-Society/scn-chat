import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { definePlugin, type ModelProvider } from '@scn-chat/plugin-api'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { recordLogin } from '../../src/auth/accounts.ts'
import { issueApiKey, listApiKeys } from '../../src/auth/api-keys.ts'
import { syncMembers } from '../../src/auth/role-store.ts'
import { createDb, type Db } from '../../src/db/index.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { writeInstances } from '../../src/plugins/instances.ts'
import { SecretBox } from '../../src/secrets.ts'
import { adminHarness } from '../helpers/admin.ts'
import { TEST_ADMIN, TEST_SECRET_KEY } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { installedFrom } from '../helpers/plugins.ts'

const caps = { vision: true, reasoning: false, tools: true }

/** Holds the setup of a plugin with `hold`, so a test can act while an apply is building. */
let gate = Promise.withResolvers<void>()

/** A provider plugin whose provider ID and admin key come from its options, and a plain one. */
const installed = installedFrom({
  'provider-plugin': {
    multiple: true,
    optionsSchema: z
      .object({
        id: z
          .string()
          .regex(/^[a-z]+$/)
          .default('fake'),
        apiKey: z.string().min(1).optional().meta({ secret: true }),
        crash: z.boolean().default(false),
        hold: z.boolean().default(false),
      })
      .strict(),
    factory: (options: { id: string; apiKey?: string; crash: boolean; hold: boolean }) =>
      definePlugin({
        id: `prov-${options.id}`,
        name: `Provider ${options.id}`,
        apiVersion: 1,
        async setup(ctx) {
          if (options.crash) throw new Error('setup exploded')
          if (options.hold) await gate.promise
          ctx.providers.register({
            id: options.id,
            name: options.id,
            hasAdminKey: Boolean(options.apiKey),
            userKeys: true,
            replay: 'drop',
            createModel: () => {
              throw new Error('not in these tests')
            },
          } as ModelProvider)
        },
      }),
  },
  'plain-plugin': {
    factory: () => definePlugin({ id: 'plain', name: 'Plain', apiVersion: 1, setup: () => {} }),
  },
})

type Doc = {
  version: number
  settings: Record<string, Record<string, unknown>>
  roles: { name: string; members?: string[]; [key: string]: unknown }[]
  plugins: { id: string; package: string; secretsSet?: string[]; [key: string]: unknown }[]
  models: { provider: string; id: string; [key: string]: unknown }[]
}

const model = (overrides: Record<string, unknown> = {}) => ({
  provider: 'fake',
  id: 'big',
  name: 'Big',
  capabilities: caps,
  roles: ['user'],
  default: false,
  ...overrides,
})

const providerPlugin = (overrides: Record<string, unknown> = {}) => ({
  id: 'fake-provider',
  package: 'provider-plugin',
  enabled: true,
  options: {},
  secrets: { apiKey: 'sk-admin' },
  ...overrides,
})

const providerInstance = (
  id: string,
  options: Record<string, unknown>,
  secrets: Record<string, unknown>,
) => ({ id, package: 'provider-plugin', enabled: true, options, secrets })

async function setup(options: { db?: Db } = {}) {
  const h = await adminHarness({ installed, ...options })
  const { key } = await issueApiKey(h.db, { label: 'ansible', roles: ['admin'] }, TEST_ADMIN)
  const config = async (method: 'GET' | 'PUT', body?: unknown) => {
    const res = await h.app.request('/api/admin/config', {
      method,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  const exported = async () => (await config('GET')).body as unknown as Doc
  /** Apply the server's own export with the changes made to it. */
  const apply = async (change: (doc: Doc) => Doc) => config('PUT', change(await exported()))
  return { ...h, config, exported, apply }
}

/** A server with a provider plugin, its model, and a staff role. */
async function configured() {
  const h = await setup()
  const res = await h.apply((doc) => ({
    ...doc,
    roles: [...doc.roles, { name: 'staff', description: 'Staff' }],
    plugins: [providerPlugin()],
    models: [model({ roles: ['staff'] })],
  }))
  expect(res.status).toBe(200)
  return h
}

describe('site config export', () => {
  it('lists every section, naming the secrets that are set without their values', async () => {
    const h = await configured()
    const doc = await h.exported()
    expect(Object.keys(doc).sort()).toEqual(['models', 'plugins', 'roles', 'settings', 'version'])
    expect(Object.keys(doc.settings).sort()).toEqual([
      'access',
      'general',
      'sessions',
      'sync',
      'turns',
    ])
    expect(doc.plugins[0]?.secretsSet).toEqual(['apiKey'])
    expect(JSON.stringify(doc)).not.toContain('sk-admin')
  })

  it('leaves out the members of a role a plugin keeps in sync', async () => {
    const h = await configured()
    await recordLogin(h.db, {
      did: 'did:plc:member',
      handle: 'member.test',
      pdsUrl: 'https://pds.test',
      spacesAllowed: false,
    })
    await syncMembers(h.db, 'staff', ['did:plc:member'], 'plugin:registry')
    const staff = (await h.exported()).roles.find((role) => role.name === 'staff')
    expect(staff).not.toHaveProperty('members')
  })
})

describe('site config apply', () => {
  it('changes nothing when given its own export', async () => {
    const h = await configured()
    expect((await h.config('PUT', await h.exported())).body).toEqual({
      changed: false,
      changes: [],
      warnings: [],
    })
  })

  it('adds plugins, models, roles, and settings that work without a restart', async () => {
    const h = await setup()
    const res = await h.apply((doc) => ({
      ...doc,
      settings: { ...doc.settings, general: { ...doc.settings.general, appName: 'Ansible Chat' } },
      roles: [...doc.roles, { name: 'staff' }],
      plugins: [providerPlugin()],
      models: [model({ roles: ['staff'] })],
    }))
    expect(res.body).toEqual({
      changed: true,
      changes: [
        'setting general updated',
        'role staff added',
        'plugin fake-provider added',
        'model fake/big added',
      ],
      warnings: [],
    })
    expect(h.holder.current().host.providers.get('fake')?.hasAdminKey).toBe(true)
    expect(h.settings.get('general').appName).toBe('Ansible Chat')
  })

  it('removes what the document leaves out, and keeps the order it lists', async () => {
    const h = await configured()
    await h.apply((doc) => ({
      ...doc,
      plugins: [providerPlugin({ id: 'other', options: { id: 'other' } }), ...doc.plugins],
      models: [model({ provider: 'other', id: 'small' }), ...doc.models],
    }))
    const res = await h.apply((doc) => ({
      ...doc,
      roles: doc.roles.filter((role) => role.name !== 'staff'),
      plugins: [...doc.plugins].reverse(),
      models: [model({ provider: 'other', id: 'small' })],
    }))
    expect(res.status).toBe(200)
    const doc = await h.exported()
    expect(doc.roles.map((role) => role.name)).toEqual(['admin'])
    expect(doc.plugins.map((plugin) => plugin.id)).toEqual(['fake-provider', 'other'])
    expect(doc.models.map((m) => `${m.provider}/${m.id}`)).toEqual(['other/small'])
  })

  it('keeps a stored secret the document leaves out, and clears one set to null', async () => {
    const h = await configured()
    const kept = await h.apply((doc) => ({
      ...doc,
      plugins: doc.plugins.map((plugin) => ({ ...plugin, options: { crash: false } })),
    }))
    expect(kept.body).toMatchObject({ changed: true })
    expect(h.holder.current().host.providers.get('fake')?.hasAdminKey).toBe(true)
    const cleared = await h.apply((doc) => ({
      ...doc,
      models: [],
      plugins: doc.plugins.map((plugin) => ({ ...plugin, secrets: { apiKey: null } })),
    }))
    expect(cleared.status).toBe(200)
    expect((await h.exported()).plugins[0]?.secretsSet).toEqual([])
  })

  it('sets the members of a role that lists them, and keeps those of a role that does not', async () => {
    const h = await setup()
    await h.apply((doc) => ({
      ...doc,
      roles: [
        ...doc.roles,
        { name: 'listed', members: ['did:plc:a', 'did:plc:b'] },
        { name: 'synced', members: ['did:plc:c'] },
      ],
    }))
    await h.apply((doc) => ({
      ...doc,
      roles: doc.roles.map((role) => {
        if (role.name === 'listed') return { ...role, members: ['did:plc:b', 'did:plc:d'] }
        const { members: _members, ...rest } = role
        return role.name === 'synced' ? rest : role
      }),
    }))
    const members = (name: string) =>
      h.db
        .selectFrom('role_member')
        .select('did')
        .where('role', '=', name)
        .orderBy('did')
        .execute()
        .then((rows) => rows.map((row) => row.did))
    expect(await members('listed')).toEqual(['did:plc:b', 'did:plc:d'])
    expect(await members('synced')).toEqual(['did:plc:c'])
  })

  it("keeps a role's description and matching rules when its entry leaves them out", async () => {
    const h = await setup()
    const admin = (await h.exported()).roles.find((role) => role.name === 'admin')
    const res = await h.apply((doc) => ({
      ...doc,
      roles: doc.roles.map((role) =>
        role.name === 'admin' ? { name: 'admin', members: ['did:plc:a'] } : role,
      ),
    }))
    expect(res.body.changes).toEqual(['role admin members updated'])
    expect((await h.exported()).roles.find((role) => role.name === 'admin')).toEqual({
      ...admin,
      members: ['did:plc:a'],
    })
  })

  /** A server whose `broken` plugin failed to load at startup. */
  async function withBrokenPlugin() {
    const db = createSqliteDb()
    await migrateToLatest(db)
    await writeInstances(
      db,
      new SecretBox(Buffer.from(TEST_SECRET_KEY, 'base64')),
      [
        providerInstance('fake-provider', { id: 'fake' }, { apiKey: 'sk-admin' }),
        providerInstance('broken', { id: 'other', crash: true }, {}),
      ],
      TEST_ADMIN,
    )
    return setup({ db })
  }

  it('applies models while an unchanged plugin is failing to load', async () => {
    const h = await withBrokenPlugin()
    const res = await h.apply((doc) => ({ ...doc, models: [model()] }))
    expect(res.body).toEqual({
      changed: true,
      changes: ['model fake/big added'],
      warnings: [expect.stringContaining('broken')],
    })
  })

  it('changes other plugins while an unchanged plugin is failing to load', async () => {
    const h = await withBrokenPlugin()
    const res = await h.apply((doc) => ({
      ...doc,
      plugins: [...doc.plugins, providerPlugin({ id: 'third', options: { id: 'third' } })],
    }))
    expect(res.body).toEqual({
      changed: true,
      changes: ['plugin third added'],
      warnings: [expect.stringContaining('broken')],
    })
  })

  it('keeps ADMIN_DIDS admins when the document lists no admins', async () => {
    const h = await setup()
    await h.apply((doc) => ({
      ...doc,
      roles: doc.roles.map((role) => (role.name === 'admin' ? { ...role, members: [] } : role)),
    }))
    expect((await h.call('GET', '/admin/roles')).status).toBe(200)
  })

  type Path = (string | number)[]

  it.each<[string, (doc: Doc) => unknown, Path]>([
    ['a missing section', ({ models: _models, ...doc }) => doc, ['models']],
    ['an unknown version', (doc) => ({ ...doc, version: 2 }), ['version']],
    [
      'a setting the server would refuse to start with',
      (doc) => ({
        ...doc,
        settings: { ...doc.settings, turns: { ...doc.settings.turns, ratePerMinute: 'ten' } },
      }),
      ['settings', 'turns', 'ratePerMinute'],
    ],
    [
      'a duplicate plugin ID',
      (doc) => ({
        ...doc,
        plugins: [...doc.plugins, providerPlugin({ options: { id: 'other' } })],
      }),
      ['plugins', 1, 'id'],
    ],
    [
      'a second instance of a single-instance package',
      (doc) => ({
        ...doc,
        plugins: [
          ...doc.plugins,
          { id: 'one', package: 'plain-plugin' },
          { id: 'two', package: 'plain-plugin' },
        ],
      }),
      ['plugins', 2, 'package'],
    ],
    [
      'an unknown role',
      (doc) => ({ ...doc, models: [model({ roles: ['ghost'] })] }),
      ['models', 0, 'roles'],
    ],
    [
      'a member that is not a DID',
      (doc) => ({ ...doc, roles: [...doc.roles, { name: 'x', members: ['bob'] }] }),
      ['roles', 2, 'members', 0],
    ],
    [
      'options that would rename a plugin',
      (doc) => ({ ...doc, plugins: [providerPlugin({ options: { id: 'renamed' } })] }),
      ['plugins', 0, 'options'],
    ],
    [
      'two instances of the same plugin',
      (doc) => ({
        ...doc,
        plugins: [...doc.plugins, providerPlugin({ id: 'again', options: { id: 'fake' } })],
      }),
      ['plugins', 1],
    ],
  ])('refuses %s and changes nothing', async (_name, change, path) => {
    const h = await configured()
    const before = await h.exported()
    const res = await h.config('PUT', change(structuredClone(before)))
    expect(res.status).toBe(400)
    expect(res.body.issues).toContainEqual(expect.objectContaining({ path }))
    expect(await h.exported()).toEqual(before)
  })

  it.each<[string, (doc: Doc) => unknown, string]>([
    ['an unknown key', (doc) => ({ ...doc, extra: true }), 'extra'],
    [
      'an unknown key in a nested setting',
      (doc) => ({
        ...doc,
        settings: {
          ...doc.settings,
          sync: { ...doc.settings.sync, safetyNet: { enabeld: false } },
        },
      }),
      'settings.sync.safetyNet.enabeld',
    ],
    [
      'an option the plugin does not have',
      (doc) => ({ ...doc, plugins: [providerPlugin({ options: { colour: 'red' } })] }),
      'colour',
    ],
    [
      'a plugin that fails to load',
      (doc) => ({
        ...doc,
        plugins: [
          ...doc.plugins,
          providerPlugin({ id: 'broken', options: { id: 'other', crash: true } }),
        ],
      }),
      'broken',
    ],
    [
      'a model whose provider has no admin key',
      (doc) => ({ ...doc, plugins: [providerPlugin({ secrets: { apiKey: null } })] }),
      'fake/big',
    ],
  ])('applies %s with a warning', async (_name, change, mentions) => {
    const h = await configured()
    const res = await h.config('PUT', change(await h.exported()))
    expect(res.status).toBe(200)
    expect(res.body.warnings).toContainEqual(expect.stringContaining(mentions))
  })

  it('keeps a setting group the file leaves out, and warns about it', async () => {
    const h = await setup()
    await h.apply((doc) => ({
      ...doc,
      settings: { ...doc.settings, general: { ...doc.settings.general, appName: 'Kept' } },
    }))
    const res = await h.apply(({ settings: { general: _general, ...settings }, ...doc }) => ({
      ...doc,
      settings,
    }))
    expect(res.body).toMatchObject({
      changed: false,
      warnings: [expect.stringContaining('general')],
    })
    expect(h.settings.get('general').appName).toBe('Kept')
  })

  it('stores a plugin whose package is not installed, and exports it as stored', async () => {
    const h = await configured()
    const orphan = { id: 'later', package: 'not-yet-installed', enabled: true, options: { a: 1 } }
    const res = await h.apply((doc) => ({ ...doc, plugins: [...doc.plugins, orphan] }))
    expect(res.body.warnings).toContainEqual(expect.stringContaining('later'))
    const doc = await h.exported()
    expect(doc.plugins[1]).toEqual({ ...orphan, secretsSet: [] })
    expect((await h.config('PUT', doc)).body).toMatchObject({ changed: false })
  })

  it('stores an option the plugin does not have, even when nothing else changes', async () => {
    const h = await configured()
    const res = await h.apply((doc) => ({
      ...doc,
      plugins: doc.plugins.map((plugin) => ({ ...plugin, options: { colour: 'red' } })),
    }))
    expect(res.body).toMatchObject({ changed: true })
    const doc = await h.exported()
    expect(doc.plugins[0]?.options).toEqual({ colour: 'red' })
    expect((await h.config('PUT', doc)).body).toMatchObject({ changed: false })
  })

  it.each<[string, (doc: Doc) => Doc, string]>([
    [
      'its package changes and its secrets are dropped',
      (doc) => ({
        ...doc,
        models: [],
        plugins: [{ id: 'fake-provider', package: 'plain-plugin' }],
      }),
      'fake-provider',
    ],
  ])('warns when %s', async (_name, change, mentions) => {
    const h = await configured()
    const res = await h.apply(change)
    expect(res.status).toBe(200)
    expect(res.body.warnings).toContainEqual(expect.stringContaining(mentions))
  })

  it('keeps an apply when an admin saves a plugin while it runs', async () => {
    const h = await configured()
    const doc = await h.exported()
    await h.signIn(TEST_ADMIN)
    gate = Promise.withResolvers<void>()
    const applying = h.config('PUT', {
      ...doc,
      plugins: [
        ...doc.plugins,
        providerPlugin({ id: 'third', options: { id: 'third', hold: true } }),
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const saving = h.call('PUT', '/admin/plugins/fake-provider', { enabled: true, options: {} })
    await new Promise((resolve) => setTimeout(resolve, 50))
    gate.resolve()
    expect((await applying).status).toBe(200)
    expect((await saving).status).toBe(200)
    expect((await h.exported()).plugins.map((plugin) => plugin.id)).toEqual([
      'fake-provider',
      'third',
    ])
  })

  it('warns that it ignored a secretsSet that differs from the stored secrets', async () => {
    const h = await configured()
    const res = await h.apply((doc) => ({
      ...doc,
      plugins: doc.plugins.map((plugin) => ({ ...plugin, secretsSet: [] })),
    }))
    expect(res.body.warnings).toContainEqual(expect.stringContaining('fake-provider'))
    expect((await h.exported()).plugins[0]?.secretsSet).toEqual(['apiKey'])
  })

  it('warns once more when a plugin that is not installed is given options', async () => {
    const warningsFor = async (options: Record<string, unknown>) => {
      const h = await configured()
      const later = { id: 'later', package: 'not-yet-installed', options }
      const res = await h.apply((doc) => ({ ...doc, plugins: [...doc.plugins, later] }))
      return res.body.warnings as string[]
    }
    const without = await warningsFor({})
    expect(await warningsFor({ apiKey: 'sk-plain' })).toHaveLength(without.length + 1)
  })

  it('stores a secret given under options as a secret', async () => {
    const h = await configured()
    await h.apply((doc) => ({
      ...doc,
      plugins: [providerPlugin({ options: { apiKey: 'sk-new' }, secrets: {} })],
    }))
    const [plugin] = (await h.exported()).plugins
    expect(plugin?.options).toEqual({})
    expect(plugin?.secretsSet).toEqual(['apiKey'])
  })

  it('refuses to remove a role an API key holds', async () => {
    const h = await configured()
    await issueApiKey(h.db, { label: 'staff key', roles: ['staff'] }, TEST_ADMIN)
    const res = await h.apply((doc) => ({
      ...doc,
      roles: doc.roles.filter((role) => role.name !== 'staff'),
      models: [],
    }))
    expect(res.status).toBe(400)
    expect(res.body.issues).toContainEqual(expect.objectContaining({ path: ['roles'] }))
    expect((await h.exported()).roles.map((role) => role.name)).toContain('staff')
  })
})

describe('site config routes', () => {
  it('refuse a signed-in admin without a key', async () => {
    const h = await setup()
    expect((await h.call('GET', '/admin/config')).status).toBe(401)
  })
})

const CLI = fileURLToPath(new URL('../../src/site-config-cli.ts', import.meta.url))
const servers: { close: () => void }[] = []
afterEach(() => {
  for (const server of servers.splice(0)) server.close()
})

/** A server listening on a free port, over a database file the CLI opens too. */
async function listening() {
  const dir = mkdtempSync(join(tmpdir(), 'site-config-'))
  const databaseUrl = `sqlite:${join(dir, 'db.sqlite')}`
  const h = await setup({ db: createDb(databaseUrl) })
  const server = serve({ fetch: h.app.fetch, port: 0, hostname: '127.0.0.1' })
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  /** Run the CLI against the server, from `cwd`, with `input` on stdin. */
  const cli = (
    args: string[],
    options: { input?: string; cwd?: string; url?: string; databaseUrl?: string } = {},
  ) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const { INIT_CWD: _caller, ...env } = process.env
      const child = execFile(
        process.execPath,
        [CLI, ...args, '--url', options.url ?? url],
        {
          cwd: options.cwd ?? dir,
          env: { ...env, DATABASE_URL: options.databaseUrl ?? databaseUrl },
        },
        (err, stdout, stderr) => resolve({ code: err ? Number(err.code) : 0, stdout, stderr }),
      )
      child.stdin?.end(options.input ?? '')
    })
  const cliKeys = async () =>
    (await listApiKeys(h.db)).filter((key) => key.label === 'site-config CLI')
  return { ...h, dir, cli, cliKeys }
}

describe('site-config CLI', () => {
  it('exports through a single-use key it revokes afterwards', async () => {
    const h = await listening()
    const { code, stdout } = await h.cli(['export'])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual(await h.exported())
    expect(await h.cliKeys()).toEqual([])
  })

  it('applies a document from stdin', async () => {
    const h = await listening()
    const doc = await h.exported()
    const { code } = await h.cli(['apply'], {
      input: JSON.stringify({ ...doc, roles: [...doc.roles, { name: 'staff' }] }),
    })
    expect(code).toBe(0)
    expect((await h.exported()).roles.map((role) => role.name)).toContain('staff')
  })

  it('applies a document from a file named from where it ran', async () => {
    const h = await listening()
    const doc = await h.exported()
    writeFileSync(
      join(h.dir, 'site.json'),
      JSON.stringify({ ...doc, roles: [...doc.roles, { name: 'staff' }] }),
    )
    const { code } = await h.cli(['apply', 'site.json'], { cwd: h.dir })
    expect(code).toBe(0)
    expect((await h.exported()).roles.map((role) => role.name)).toContain('staff')
  })

  it('refuses a --url that is not a URL, before touching the database', async () => {
    const h = await listening()
    expect((await h.cli(['export'], { url: 'not a url' })).code).toBe(2)
    expect(await h.cliKeys()).toEqual([])
  })

  it('refuses a database file that does not exist, without creating one', async () => {
    const h = await listening()
    const missing = join(h.dir, 'missing', 'db.sqlite')
    expect((await h.cli(['export'], { databaseUrl: `sqlite:${missing}` })).code).toBe(2)
    expect(existsSync(missing)).toBe(false)
  })

  it('prints warnings and still exits 0', async () => {
    const h = await listening()
    const { code, stderr } = await h.cli(['apply'], {
      input: JSON.stringify({ ...(await h.exported()), extra: true }),
    })
    expect(code).toBe(0)
    expect(stderr).toContain('extra')
  })

  it('exits 1 with the issues when the apply is refused', async () => {
    const h = await listening()
    const doc = await h.exported()
    const { code, stderr } = await h.cli(['apply'], {
      input: JSON.stringify({ ...doc, models: [model({ roles: ['ghost'] })] }),
    })
    expect(code).toBe(1)
    expect(stderr).toContain('ghost')
  })

  /** An admin key issued two hours ago by `by`, labelled like the CLI's own. */
  async function oldKey(h: Awaited<ReturnType<typeof listening>>, by: string) {
    const { id } = await issueApiKey(h.db, { label: 'site-config CLI', roles: ['admin'] }, by)
    await h.db
      .updateTable('api_key')
      .set({ created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString() })
      .where('id', '=', id)
      .execute()
  }

  it('revokes CLI keys a killed run left behind more than an hour ago', async () => {
    const h = await listening()
    await oldKey(h, 'site-config CLI')
    await h.cli(['export'])
    expect(await h.cliKeys()).toEqual([])
  })

  it('keeps an old key an admin issued, whatever its label', async () => {
    const h = await listening()
    await oldKey(h, TEST_ADMIN)
    await h.cli(['export'])
    expect(await h.cliKeys()).toHaveLength(1)
  })
})
