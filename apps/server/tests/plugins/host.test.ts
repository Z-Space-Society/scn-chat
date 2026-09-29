import { definePlugin, type ModelProvider, type Plugin } from '@scn-chat/plugin-api'
import pino from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlugins, PluginLoadError, type PluginServices } from '../../src/plugins/host.ts'

const logger = pino({ level: 'silent' })
const app = { name: 'Test', publicUrl: 'http://127.0.0.1:3000' }
let services: PluginServices
beforeEach(() => {
  services = {
    generateText: vi.fn(async () => ({ text: 'generated', finishReason: 'stop' })),
    updateInfo: vi.fn(async () => {}),
    userSettings: vi.fn(async () => ({ enabled: true })),
  }
})

const plugin = (id: string, setup: Plugin['setup'] = () => {}, apiVersion = 1) =>
  definePlugin({ id, name: id, apiVersion, setup })

const provider = (id: string) => ({ id }) as ModelProvider

describe('loadPlugins', () => {
  it('calls each setup once, in config order', async () => {
    const calls: string[] = []
    await loadPlugins(
      [
        plugin('first', () => void calls.push('first')),
        plugin('second', () => void calls.push('second')),
      ],
      { services, logger, app },
    )
    expect(calls).toEqual(['first', 'second'])
  })

  it('waits for async setups before loading the next plugin', async () => {
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

  it('fails when two plugins share an ID, naming it', async () => {
    await expect(
      loadPlugins([plugin('dup'), plugin('dup')], { services, logger, app }),
    ).rejects.toThrow(/Two plugins use the ID "dup"/)
  })

  it('fails for an unsupported apiVersion, naming the plugin and version', async () => {
    const promise = loadPlugins([plugin('future', () => {}, 2)], { services, logger, app })
    await expect(promise).rejects.toBeInstanceOf(PluginLoadError)
    await expect(promise).rejects.toThrow(/"future".*version 2/)
  })

  it('fails for an invalid plugin ID', async () => {
    await expect(loadPlugins([plugin('Bad ID')], { services, logger, app })).rejects.toThrow(
      /must match/,
    )
  })

  it('fails when two plugins register the same provider ID', async () => {
    const a = plugin('a', (ctx) => ctx.providers.register(provider('anthropic')))
    const b = plugin('b', (ctx) => ctx.providers.register(provider('anthropic')))
    await expect(loadPlugins([a, b], { services, logger, app })).rejects.toThrow(/anthropic/)
  })

  it('fails when two plugins register the same tool name or ingester ID', async () => {
    const tool = {
      name: 'search',
      description: '',
      inputSchema: {} as never,
      run: async () => null,
    }
    const toolA = plugin('a', (ctx) => ctx.tools.register(tool))
    const toolB = plugin('b', (ctx) => ctx.tools.register(tool))
    await expect(loadPlugins([toolA, toolB], { services, logger, app })).rejects.toThrow(/search/)
    const ingester = {
      id: 'pdf',
      accepts: ['application/pdf'],
      method: 'text' as const,
      ingest: async () => ({ text: '' }),
    }
    const ingA = plugin('a', (ctx) => ctx.ingesters.register(ingester))
    const ingB = plugin('b', (ctx) => ctx.ingesters.register(ingester))
    await expect(loadPlugins([ingA, ingB], { services, logger, app })).rejects.toThrow(/pdf/)
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

  it('says no ingester accepts a type none registered', async () => {
    let accepts: boolean | undefined
    const probe = plugin('probe', (ctx) => {
      accepts = ctx.ingesters.accepts('application/pdf')
    })
    await loadPlugins([probe], { services, logger, app })
    expect(accepts).toBe(false)
  })

  it('gives plugins the services through their context', async () => {
    let seen: unknown
    const reader = plugin('reader', async (ctx) => {
      seen = await ctx.userSettings('did:plc:a')
      await ctx.conversations.updateInfo(
        'did:plc:a',
        'at://x',
        { title: 'T' },
        { unlessUserTitled: true },
      )
    })
    await loadPlugins([reader], { services, logger, app })
    expect(seen).toEqual({ enabled: true })
    expect(services.updateInfo).toHaveBeenCalledWith(
      'did:plc:a',
      'at://x',
      { title: 'T' },
      { unlessUserTitled: true },
    )
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
