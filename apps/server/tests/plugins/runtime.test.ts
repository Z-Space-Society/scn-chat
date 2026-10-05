import { definePlugin } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadPlugins } from '../../src/plugins/host.ts'
import type { PluginInstance } from '../../src/plugins/instances.ts'
import { type PluginRuntime, RuntimeHolder, runtimeBuilder } from '../../src/plugins/runtime.ts'
import { installedFrom } from '../helpers/plugins.ts'

const logger = pino({ level: 'silent' })
const load = { services: {} as never, logger, app: { name: 'T', publicUrl: 'http://x' } }

async function runtime(onClose?: () => void): Promise<PluginRuntime> {
  const host = await loadPlugins(
    [
      definePlugin({
        id: 'p',
        name: 'P',
        apiVersion: 1,
        setup: (ctx) => onClose && ctx.onClose(onClose),
      }),
    ],
    load,
  )
  return { host, catalog: {} as never, statuses: new Map() }
}

const instance = (overrides: Partial<PluginInstance>): PluginInstance => ({
  id: 'i',
  package: 'good',
  enabled: true,
  options: {},
  secrets: {},
  ...overrides,
})

describe('runtimeBuilder', () => {
  const build = runtimeBuilder({
    installed: installedFrom({
      good: {
        optionsSchema: z.object({ name: z.string().default('good') }).strict(),
        factory: (options: { name: string }) =>
          definePlugin({ id: options.name, name: options.name, apiVersion: 1, setup: () => {} }),
      },
      crashing: {
        factory: () =>
          definePlugin({
            id: 'crashing',
            name: 'Crashing',
            apiVersion: 1,
            setup: () => {
              throw new Error('kaboom')
            },
          }),
      },
    }),
    load,
    catalog: () => ({}) as never,
    logger,
  })

  it('loads enabled instances in order and records each status', async () => {
    const built = await build([
      instance({ id: 'a', options: { name: 'first' } }),
      instance({ id: 'b', enabled: false }),
      instance({ id: 'c', options: { name: 'second' } }),
    ])
    expect(built.host.plugins.map((p) => p.id)).toEqual(['first', 'second'])
    expect(Object.fromEntries(built.statuses)).toEqual({
      a: { state: 'loaded', pluginId: 'first', name: 'first' },
      b: { state: 'disabled' },
      c: { state: 'loaded', pluginId: 'second', name: 'second' },
    })
  })

  it('skips instances that are not installed, have invalid options, or fail setup, and says why', async () => {
    const built = await build([
      instance({ id: 'gone', package: 'missing' }),
      instance({ id: 'invalid', options: { name: 5 } }),
      instance({ id: 'crash', package: 'crashing' }),
      instance({ id: 'ok' }),
    ])
    expect(built.host.plugins.map((p) => p.id)).toEqual(['good'])
    const failed = (id: string) =>
      built.statuses.get(id) as { state: string; error: string; issues: unknown[] }
    expect(failed('gone')).toMatchObject({
      state: 'failed',
      error: expect.stringContaining('missing'),
    })
    expect(failed('invalid')).toMatchObject({ state: 'failed', issues: [{ path: ['name'] }] })
    expect(failed('crash').error).toMatch(/kaboom/)
  })

  it('passes stored secrets to the plugin with its options', async () => {
    const built = await build([instance({ options: {}, secrets: { name: 'from-secret' } })])
    expect(built.host.plugins.map((p) => p.id)).toEqual(['from-secret'])
  })
})

describe('RuntimeHolder', () => {
  it('keeps a leased runtime open until its last lease is released', async () => {
    const closed: string[] = []
    const first = await runtime(() => void closed.push('first'))
    const holder = new RuntimeHolder(first, logger)
    const lease = holder.acquire()
    const second = holder.acquire()
    holder.swap(await runtime())
    expect(holder.current()).not.toBe(first)
    expect(lease.runtime).toBe(first)
    lease.release()
    lease.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closed).toEqual([])
    second.release()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closed).toEqual(['first'])
  })

  it('closes a replaced runtime at once when nothing holds it', async () => {
    const closed: string[] = []
    const holder = new RuntimeHolder(await runtime(() => void closed.push('old')), logger)
    holder.swap(await runtime())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closed).toEqual(['old'])
  })

  it('runs changes one at a time, even when one fails', async () => {
    const holder = new RuntimeHolder(await runtime(), logger)
    const order: string[] = []
    const slow = holder.exclusive(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('slow')
      throw new Error('failed')
    })
    const fast = holder.exclusive(async () => void order.push('fast'))
    await expect(slow).rejects.toThrow('failed')
    await fast
    expect(order).toEqual(['slow', 'fast'])
  })
})
