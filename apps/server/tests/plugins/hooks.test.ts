import type { PlainContent, TurnContext } from '@scn-chat/plugin-api'
import { describe, expect, it, vi } from 'vitest'
import { HookRunner, PluginHookError } from '../../src/plugins/hooks.ts'

const context = {} as TurnContext
const content = (text: string): PlainContent => ({
  parts: [{ $type: 'network.sharedcomputer.chat.defs#textPart', text }],
})
const textOf = (value: PlainContent) => (value.parts[0] as { text: string }).text
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('HookRunner.filter', () => {
  it('runs pre, then normal, then post, with config order inside each group', async () => {
    const hooks = new HookRunner()
    const append = (tag: string) => (value: PlainContent) => content(`${textOf(value)}${tag}`)
    hooks.add('message:afterModel', 'b', 1, append('[b-normal]'))
    hooks.add('message:afterModel', 'c', 2, append('[c-pre]'), 'pre')
    hooks.add('message:afterModel', 'a', 0, append('[a-post]'), 'post')
    hooks.add('message:afterModel', 'a', 0, append('[a-normal]'))
    const result = await hooks.filter('message:afterModel', content(''), context)
    expect(textOf(result)).toBe('[c-pre][a-normal][b-normal][a-post]')
  })

  it('passes each filter the previous filter return value', async () => {
    const hooks = new HookRunner()
    const seen: string[] = []
    hooks.add('message:afterModel', 'a', 0, () => content('from a'))
    hooks.add('message:afterModel', 'b', 1, (value) => {
      seen.push(textOf(value))
      return value
    })
    await hooks.filter('message:afterModel', content('original'), context)
    expect(seen).toEqual(['from a'])
  })

  it('fails with an error naming the plugin when a filter throws', async () => {
    const hooks = new HookRunner()
    hooks.add('message:afterModel', 'broken', 0, () => {
      throw new Error('boom')
    })
    const promise = hooks.filter('message:afterModel', content('x'), context)
    await expect(promise).rejects.toBeInstanceOf(PluginHookError)
    await expect(promise).rejects.toThrow(/broken/)
  })
})

describe('HookRunner.action', () => {
  it('logs a throwing action and still runs later actions', async () => {
    const hooks = new HookRunner()
    const later = vi.fn()
    hooks.add('conversation:created', 'broken', 0, () => {
      throw new Error('boom')
    })
    hooks.add('conversation:created', 'fine', 1, later)
    const failed = await hooks.action(
      'conversation:created',
      { user: 'did:plc:a', conversation: 'at://x' },
      logger,
    )
    expect(later).toHaveBeenCalledOnce()
    expect(failed).toEqual(['broken'])
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: 'broken' }),
      expect.anything(),
    )
  })

  it('stops waiting once the signal aborts, failing the handler running and those not reached', async () => {
    const hooks = new HookRunner()
    const skipped = vi.fn()
    hooks.add('cron', 'slow', 0, () => new Promise(() => {}))
    hooks.add('cron', 'after', 1, skipped)
    const failed = await hooks.action('cron', { startedAt: '' }, logger, AbortSignal.timeout(10))
    expect(failed).toEqual(['slow', 'after'])
    expect(skipped).not.toHaveBeenCalled()
  })
})
