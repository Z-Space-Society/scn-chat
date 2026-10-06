import {
  definePlugin,
  type ModelProvider,
  type Plugin,
  type PluginContext,
} from '@scn-chat/plugin-api'
import pino from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlugins, PluginLoadError, type PluginServices } from '../../src/plugins/host.ts'
import { DuplicateRegistrationError } from '../../src/plugins/registry.ts'

const logger = pino({ level: 'silent' })
const app = { name: 'Test', publicUrl: 'http://127.0.0.1:3000' }
let services: PluginServices
beforeEach(() => {
  services = {
    generateText: vi.fn(async () => ({ text: 'generated', finishReason: 'stop' })),
    updateInfo: vi.fn(async () => {}),
    userSettings: vi.fn(async () => ({ enabled: true })),
    suspendAccount: vi.fn(async () => true),
    restoreAccount: vi.fn(async () => true),
    syncRoleMembers: vi.fn(async () => ({ added: 0, removed: 0 })),
    addRoleMember: vi.fn(async () => {}),
  }
})

const plugin = (id: string, setup: Plugin['setup'] = () => {}, apiVersion = 1) =>
  definePlugin({ id, name: id, apiVersion, setup })

const provider = (id: string) => ({ id }) as ModelProvider

describe('loadPlugins', () => {
  it('calls each setup in config order, waiting for async ones', async () => {
    const calls: string[] = []
    const slow = plugin('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      calls.push('slow')
    })
    await loadPlugins([slow, plugin('fast', () => void calls.push('fast'))], {
      services,
      logger,
      app,
    })
    expect(calls).toEqual(['slow', 'fast'])
  })

  it.each([
    ['a duplicate ID', [plugin('dup'), plugin('dup')]],
    ['an unsupported apiVersion', [plugin('future', () => {}, 2)]],
    ['an invalid ID', [plugin('Bad ID')]],
  ])('refuses %s', async (_case, plugins) => {
    await expect(loadPlugins(plugins, { services, logger, app })).rejects.toBeInstanceOf(
      PluginLoadError,
    )
  })

  it.each<[string, Plugin['setup']]>([
    ['provider', (ctx) => ctx.providers.register(provider('anthropic'))],
    [
      'tool',
      (ctx) =>
        ctx.tools.register({
          name: 'search',
          description: '',
          inputSchema: {} as never,
          run: async () => null,
        }),
    ],
    [
      'ingester',
      (ctx) =>
        ctx.ingesters.register({
          id: 'pdf',
          accepts: ['application/pdf'],
          method: 'text',
          ingest: async () => ({ text: '' }),
        }),
    ],
  ])('fails when two plugins register the same %s', async (_kind, setup) => {
    await expect(
      loadPlugins([plugin('a', setup), plugin('b', setup)], { services, logger, app }),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError)
  })

  it("lets a plugin reach other plugins' ingesters by MIME type, with the highest priority winning", async () => {
    const ingester = (id: string, priority: number) => ({
      id,
      accepts: ['application/pdf'],
      priority,
      method: 'text' as const,
      ingest: async () => ({ text: id }),
    })
    let found: { accepts: boolean; text?: string; other?: unknown } | undefined
    const pdf = plugin('pdf', (ctx) => ctx.ingesters.register(ingester('pdf-text', 0)))
    const ocr = plugin('ocr', (ctx) => ctx.ingesters.register(ingester('ocr', 5)))
    const fetcher = plugin('fetcher', (ctx) => {
      ctx.onClose(async () => {
        const file = { bytes: new Uint8Array(), mimeType: 'application/pdf' }
        found = {
          accepts: ctx.ingesters.accepts('application/pdf'),
          text: (await ctx.ingesters.ingest(file))?.text,
          other: await ctx.ingesters.ingest({ ...file, mimeType: 'image/tiff' }),
        }
      })
    })
    const host = await loadPlugins([fetcher, pdf, ocr], { services, logger, app })
    await host.close()
    expect(found).toEqual({ accepts: true, text: 'ocr', other: undefined })
  })

  it('runs registered cleanup at close, newest first', async () => {
    const order: string[] = []
    const host = await loadPlugins(
      [
        plugin('a', (ctx) => ctx.onClose(() => void order.push('a'))),
        plugin('b', (ctx) => ctx.onClose(() => void order.push('b'))),
      ],
      { services, logger, app },
    )
    await host.close()
    expect(order).toEqual(['b', 'a'])
  })
})

describe('loadPlugins with onFailure', () => {
  it('skips a plugin whose setup throws, discards what it registered, and keeps the rest', async () => {
    const closed: string[] = []
    const failures: [number, string][] = []
    const host = await loadPlugins(
      [
        plugin('broken', (ctx) => {
          ctx.providers.register(provider('half'))
          ctx.onClose(() => void closed.push('broken'))
          throw new Error('boom')
        }),
        plugin('fine', (ctx) => ctx.providers.register(provider('whole'))),
      ],
      { services, logger, app },
      { onFailure: (index, error) => void failures.push([index, error.message]) },
    )
    expect(failures).toEqual([[0, 'boom']])
    expect(host.plugins.map((p) => p.id)).toEqual(['fine'])
    expect(host.providers.get('half')).toBeUndefined()
    expect(host.providers.get('whole')).toBeDefined()
    expect(closed).toEqual(['broken'])
  })

  it('skips the later of two plugins that register the same provider, keeping the first', async () => {
    const failures: number[] = []
    const host = await loadPlugins(
      [
        plugin('a', (ctx) => ctx.providers.register(provider('same'))),
        plugin('b', (ctx) => ctx.providers.register(provider('same'))),
      ],
      { services, logger, app },
      { onFailure: (index) => void failures.push(index) },
    )
    expect(failures).toEqual([1])
    expect(host.providers.owner('same')).toBe('a')
  })

  it('closes the plugins already loaded when one fails without onFailure', async () => {
    const closed: string[] = []
    await expect(
      loadPlugins(
        [
          plugin('first', (ctx) => ctx.onClose(() => void closed.push('first'))),
          plugin('second', () => {
            throw new Error('boom')
          }),
        ],
        { services, logger, app },
      ),
    ).rejects.toThrow('boom')
    expect(closed).toEqual(['first'])
  })

  it('suspends and restores accounts on behalf of the plugin', async () => {
    let changed: boolean[] = []
    await loadPlugins(
      [
        plugin('members', async (ctx) => {
          changed = [
            await ctx.accounts.suspend('did:plc:bob', { reason: 'Application revoked' }),
            await ctx.accounts.restore('did:plc:bob'),
          ]
        }),
      ],
      { services, logger, app },
    )
    expect(changed).toEqual([true, true])
    expect(services.suspendAccount).toHaveBeenCalledWith(
      'did:plc:bob',
      'plugin:members',
      'Application revoked',
    )
    expect(services.restoreAccount).toHaveBeenCalledWith('did:plc:bob', 'plugin:members')
  })

  it("changes a role's members on the plugin's behalf", async () => {
    await loadPlugins(
      [
        plugin('members', async (ctx) => {
          await ctx.roles.syncMembers('staff', ['did:plc:bob'])
          await ctx.roles.addMember('staff', 'did:plc:carol')
        }),
      ],
      { services, logger, app },
    )
    expect(services.syncRoleMembers).toHaveBeenCalledWith(
      'staff',
      ['did:plc:bob'],
      'plugin:members',
    )
    expect(services.addRoleMember).toHaveBeenCalledWith('staff', 'did:plc:carol', 'plugin:members')
  })

  it('reads the app name live', async () => {
    let name = 'Before'
    let context: PluginContext | undefined
    await loadPlugins(
      [
        plugin('reader', (ctx) => {
          context = ctx
        }),
      ],
      {
        services,
        logger,
        app: {
          get name() {
            return name
          },
          publicUrl: 'http://x',
        },
      },
    )
    name = 'After'
    expect(context?.app.name).toBe('After')
  })
})
