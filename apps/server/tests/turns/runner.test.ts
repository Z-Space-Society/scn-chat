import { nsid } from '@scn-chat/lexicons'
import {
  definePlugin,
  type Tool,
  type ToolContext,
  type ToolSource,
  type TurnContext,
} from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { loadPlugins } from '../../src/plugins/host.ts'
import { writeToolChoice } from '../../src/plugins/user-tools.ts'
import { safeErrorMessage } from '../../src/safe-error.ts'
import { LocalRecordStore } from '../../src/storage/local-record-store.ts'
import { ALICE, textContent, userMessage } from '../helpers/spaces.ts'
import {
  scriptedModel,
  sequenceModel,
  textReply,
  toolCall,
  turnsHarness,
} from '../helpers/turns.ts'

const partsOf = (record: Record<string, unknown> | undefined) =>
  ((record?.content as { parts: { text?: string }[] })?.parts ?? []).map((p) => p.text).join('')

async function sendUser(
  h: Awaited<ReturnType<typeof turnsHarness>>,
  skey: string,
  rkey: string,
  extra: Record<string, unknown> = {},
) {
  await h.chats.createMessage(
    skey,
    rkey,
    userMessage(`question ${rkey}`, { generation: {}, ...extra }) as never,
  )
}

describe('TurnRunner.start', () => {
  it('claims with a pending reply at <key>.r0, then writes the finished reply', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    const started = await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    expect(started).toEqual({ status: 'claimed', replyRkey: '3uuuuuuuuuuu1.r0' })
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({
      role: 'assistant',
      parent: '3uuuuuuuuuuu1',
      status: 'complete',
      model: { provider: 'fake', id: 'default-model' },
    })
    expect(partsOf(reply)).toBe('Hello')
    expect(reply?.usage).toEqual({ inputTokens: 10, outputTokens: 5, reasoningTokens: 0 })
  })

  it('skips a user message without a generation request', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await h.chats.createMessage(skey, '3uuuuuuuuuuu1', userMessage('no reply wanted') as never)
    expect(await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')).toEqual({ status: 'skipped' })
    expect((await h.messages(skey)).size).toBe(1)
  })

  it('runs exactly one generation when two runners notice the same message', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    const results = await Promise.all([
      h.runner.start(ALICE, skey, '3uuuuuuuuuuu1'),
      h.runner.start(ALICE, skey, '3uuuuuuuuuuu1'),
    ])
    await h.runner.idle()
    expect(results.map((r) => r.status).sort()).toEqual(['claimed', 'exists'])
    expect(h.created).toHaveLength(1)
  })

  it('writes regenerations at <key>.r<attempt> and keeps earlier replies', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const current = (await h.messages(skey)).get('3uuuuuuuuuuu1') as Record<string, unknown>
    await h.chats.putMessage(skey, '3uuuuuuuuuuu1', { ...current, generation: { attempt: 1 } })
    expect((await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')).replyRkey).toBe('3uuuuuuuuuuu1.r1')
    await h.runner.idle()
    const all = await h.messages(skey)
    expect(all.has('3uuuuuuuuuuu1.r0')).toBe(true)
    expect(all.get('3uuuuuuuuuuu1.r1')?.status).toBe('complete')
  })

  it('gives an edit its own reply as a sibling', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    await sendUser(h, skey, '3uuuuuuuuuuu2', { parent: '3uuuuuuuuuuu1.r0' })
    await sendUser(h, skey, '3uuuuuuuuuuu3', { parent: '3uuuuuuuuuuu1.r0' })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu3')
    await h.runner.idle()
    const all = await h.messages(skey)
    expect(all.get('3uuuuuuuuuuu2.r0')?.status).toBe('complete')
    expect(all.get('3uuuuuuuuuuu3.r0')?.status).toBe('complete')
  })

  it('resolves the model from the request, then the last reply, then preferences, then the admin default', async () => {
    const h = await turnsHarness({
      adminModels: [
        { id: 'admin-default', default: true },
        { id: 'requested' },
        { id: 'preferred' },
      ],
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    await h.chats.putPreferences({ defaultModel: { provider: 'fake', id: 'preferred' } })
    await sendUser(h, skey, '3uuuuuuuuuuu2', {
      parent: '3uuuuuuuuuuu1.r0',
      generation: { model: { provider: 'fake', id: 'requested' } },
    })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.idle()
    await sendUser(h, skey, '3uuuuuuuuuuu3', { parent: '3uuuuuuuuuuu2.r0' })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu3')
    await h.runner.idle()
    const other = await h.chats.createConversation()
    await sendUser(h, other.skey, '3uuuuuuuuuuu4')
    await h.runner.start(ALICE, other.skey, '3uuuuuuuuuuu4')
    await h.runner.idle()
    expect(h.created).toEqual(['admin-default', 'requested', 'requested', 'preferred'])
  })

  it('sends only the branch, with custom instructions and the system prompt as instructions', async () => {
    const script = scriptedModel(textReply('ok'))
    const h = await turnsHarness({ model: () => script.model })
    const { skey } = await h.chats.createConversation({ systemPrompt: 'Be brief' })
    await h.chats.putPreferences({ customInstructions: 'Metric units' })
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    await sendUser(h, skey, '3uuuuuuuuuuuX', { parent: '3uuuuuuuuuuu1.r0' })
    await sendUser(h, skey, '3uuuuuuuuuuu2', { parent: '3uuuuuuuuuuu1.r0' })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.idle()
    const prompt = JSON.stringify(script.prompts.at(-1))
    expect(prompt).toContain('Metric units\\n\\nBe brief')
    expect(prompt).toContain('question 3uuuuuuuuuuu1')
    expect(prompt).toContain('question 3uuuuuuuuuuu2')
    expect(prompt).not.toContain('question 3uuuuuuuuuuuX')
  })

  it("starts the instructions with the base prompt, dated in the user's time zone", async () => {
    const script = scriptedModel(textReply('ok'))
    const h = await turnsHarness({
      model: () => script.model,
      systemPrompt: '{{appName}} on {{date}}',
      now: () => Date.parse('2026-09-30T02:30:00Z'),
    })
    const { skey } = await h.chats.createConversation({ systemPrompt: 'Be brief' })
    await h.chats.putPreferences({ timezone: 'America/Vancouver' })
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    expect(JSON.stringify(script.prompts.at(-1))).toContain(
      'Test Chat on Tuesday, September 29, 2026\\n\\nBe brief',
    )
  })

  it('gives hooks the names of the tools offered this turn', async () => {
    let offered: string[] | undefined
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'fetcher',
          name: 'Fetcher',
          apiVersion: 1,
          setup: (ctx) => {
            ctx.tools.register({
              name: 'fetch',
              description: 'Fetch a page',
              inputSchema: z.object({}) as never,
              run: async () => 'page',
            })
            ctx.hooks.on('messages:beforeModel', (value, turn) => {
              offered = turn.tools
              return value
            })
          },
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'http://x' },
      },
    )
    const h = await turnsHarness({ host })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1', { generation: { tools: ['fetch'] } })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    expect(offered).toEqual(['fetch'])
  })

  it('ends with status error, a message without secrets, and the partial parts on a provider error', async () => {
    const parts = [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: 'Part' },
      { type: 'error', error: new Error('upstream rejected key sk-live-abcdef123456') },
    ]
    const h = await turnsHarness({ model: () => scriptedModel(parts).model })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply?.status).toBe('error')
    expect(reply?.error).not.toContain('sk-live')
    expect(partsOf(reply)).toBe('Part')
  })

  it('ends with status cancelled and keeps partial parts when cancelled', async () => {
    const h = await turnsHarness({
      model: () =>
        scriptedModel(textReply('a long reply that streams slowly'), { delayMs: 20 }).model,
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(await h.runner.cancel(ALICE, skey, '3uuuuuuuuuuu1.r0')).toBe(true)
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply?.status).toBe('cancelled')
    expect(partsOf(reply).length).toBeGreaterThan(0)
    expect(partsOf(reply).length).toBeLessThan('a long reply that streams slowly'.length)
  })

  it('cancels a turn that runs past the timeout', async () => {
    const h = await turnsHarness({
      timeoutMs: 100,
      model: () => scriptedModel(textReply('slow slow slow slow'), { delayMs: 30 }).model,
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    expect((await h.messages(skey)).get('3uuuuuuuuuuu1.r0')?.status).toBe('cancelled')
  })

  it('moves the largest tool outputs into blobs when the record would pass 900 KB', async () => {
    const huge = 'x'.repeat(950_000)
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'fetcher',
          name: 'Fetcher',
          apiVersion: 1,
          setup: (ctx) =>
            ctx.tools.register({
              name: 'fetch',
              description: 'Fetch a page',
              inputSchema: z.object({}) as never,
              run: async () => huge,
            }),
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'http://x' },
      },
    )
    const finish = {
      type: 'finish',
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
    }
    const script = sequenceModel([
      [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'fetch', input: '{}' },
        finish,
      ],
      textReply('Summarized.'),
    ])
    const h = await turnsHarness({ host, model: () => script.model })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1', { generation: { tools: ['fetch'] } })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply?.status).toBe('complete')
    const result = (reply!.content as { parts: Record<string, unknown>[] }).parts.find((p) =>
      String(p.$type).endsWith('toolResultPart'),
    )
    expect(result?.outputBlob).toMatchObject({ $type: 'blob', mimeType: 'text/plain' })
    expect(String(result?.output).length).toBeLessThan(1000)
    expect(h.stored.get(`bafkrei0fake`)?.length).toBeGreaterThan(900_000)
  })

  it('queues past the rate limit without claiming, and starts once the limit allows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const h = await turnsHarness({ ratePerMinute: 1 })
      const { skey } = await h.chats.createConversation()
      await sendUser(h, skey, '3uuuuuuuuuuu1')
      await sendUser(h, skey, '3uuuuuuuuuuu2')
      await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
      expect(await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')).toEqual({
        status: 'queued',
        replyRkey: '3uuuuuuuuuuu2.r0',
      })
      expect((await h.messages(skey)).has('3uuuuuuuuuuu2.r0')).toBe(false)
      expect(await h.db.selectFrom('turn_request').selectAll().execute()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(61_000)
      await h.runner.idle()
      expect((await h.messages(skey)).get('3uuuuuuuuuuu2.r0')?.status).toBe('complete')
      expect(h.created).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends the stream of a queued turn that fails to start, without an unhandled rejection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const h = await turnsHarness({ ratePerMinute: 1 })
      const { skey } = await h.chats.createConversation()
      await sendUser(h, skey, '3uuuuuuuuuuu1')
      await sendUser(h, skey, '3uuuuuuuuuuu2')
      await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
      await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
      const events: string[] = []
      h.hub.subscribe(h.runner.streamKey(ALICE, skey, '3uuuuuuuuuuu2.r0'), (event) =>
        events.push(event.type === 'status' ? `status:${event.status}` : event.type),
      )
      vi.spyOn(h.services, 'forAccount').mockImplementation(() => {
        throw new Error('PDS unavailable')
      })
      await vi.advanceTimersByTimeAsync(61_000)
      expect(events).toEqual(['queued', 'status:error'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends the stream of a queued turn that another runner already answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const h = await turnsHarness({ ratePerMinute: 1 })
      const { skey } = await h.chats.createConversation()
      await sendUser(h, skey, '3uuuuuuuuuuu1')
      await sendUser(h, skey, '3uuuuuuuuuuu2')
      await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
      await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
      await h.chats.createMessage(skey, '3uuuuuuuuuuu2.r0', {
        $type: nsid.message,
        role: 'assistant',
        parent: '3uuuuuuuuuuu2',
        status: 'complete',
        content: textContent('elsewhere'),
        createdAt: new Date().toISOString(),
      } as never)
      const statuses: string[] = []
      h.hub.subscribe(h.runner.streamKey(ALICE, skey, '3uuuuuuuuuuu2.r0'), (event) => {
        if (event.type === 'status') statuses.push(event.status)
      })
      await vi.advanceTimersByTimeAsync(61_000)
      await vi.waitFor(() => expect(statuses).toEqual(['exists']))
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a queued turn, dropping its request and ending its stream', async () => {
    const h = await turnsHarness({ ratePerMinute: 1 })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await sendUser(h, skey, '3uuuuuuuuuuu2')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.idle()
    expect(await h.runner.cancel(ALICE, skey, '3uuuuuuuuuuu2.r0')).toBe(true)
    expect(await h.db.selectFrom('turn_request').selectAll().execute()).toEqual([])
    const statuses: string[] = []
    h.hub.subscribe(h.runner.streamKey(ALICE, skey, '3uuuuuuuuuuu2.r0'), (event) => {
      if (event.type === 'status') statuses.push(event.status)
    })
    expect(statuses).toEqual(['cancelled'])
  })

  it('queues the same unclaimed turn once', async () => {
    const h = await turnsHarness({ ratePerMinute: 1 })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await sendUser(h, skey, '3uuuuuuuuuuu2')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    expect(await h.db.selectFrom('turn_request').selectAll().execute()).toHaveLength(1)
  })

  it('runs the turn:after hook after the final record is written', async () => {
    let seen: TurnContext | undefined
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'watcher',
          name: 'Watcher',
          apiVersion: 1,
          setup: (ctx) =>
            ctx.hooks.on('turn:after', (turn) => {
              seen = turn
            }),
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'http://x' },
      },
    )
    const h = await turnsHarness({ host })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    expect(seen?.reply.rkey).toBe('3uuuuuuuuuuu1.r0')
    expect((seen!.reply.record as unknown as { status: string }).status).toBe('complete')
  })

  it('fails the turn with an error naming the plugin when a filter throws', async () => {
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'strict',
          name: 'Strict',
          apiVersion: 1,
          setup: (ctx) =>
            ctx.hooks.on('messages:beforeModel', () => {
              throw new Error('nope')
            }),
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'http://x' },
      },
    )
    const h = await turnsHarness({ host })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('strict') })
  })

  it('saves an empty reply when an afterModel filter throws', async () => {
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'redact',
          name: 'Redact',
          apiVersion: 1,
          setup: (ctx) =>
            ctx.hooks.on('message:afterModel', () => {
              throw new Error('redaction failed')
            }),
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'http://x' },
      },
    )
    const h = await turnsHarness({ host })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('redact') })
    expect(partsOf(reply)).toBe('')
  })

  it('fails the turn when it asks for tools on a model that cannot use them', async () => {
    const h = await turnsHarness({
      host: await hostWith([tool('web_search')]),
      adminModels: [
        {
          id: 'plain',
          default: true,
          capabilities: { vision: false, reasoning: false, tools: false },
        },
      ],
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1', { generation: { tools: ['web_search'] } })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply?.status).toBe('error')
  })

  it('fails the turn when it asks for a tool that is not installed', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1', { generation: { tools: ['web_search'] } })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('web_search') })
  })

  it('ends with an error reply when the provider call itself throws', async () => {
    const h = await turnsHarness({
      model: () => scriptedModel([], { fail: new Error('connect ECONNREFUSED') }).model,
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('ECONNREFUSED') })
  })

  it('writes an error reply when the finished reply cannot be written but the error can', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    const original = LocalRecordStore.prototype.putRecord
    const put = vi
      .spyOn(LocalRecordStore.prototype, 'putRecord')
      .mockImplementation(async function (this: LocalRecordStore, space, collection, rkey, value) {
        if (collection === nsid.message && value.status === 'complete')
          throw new Error('record too large')
        return original.call(this, space, collection, rkey, value)
      })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    put.mockRestore()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: 'record too large' })
    expect(await h.db.selectFrom('turn_claim').selectAll().execute()).toEqual([])
  })

  it('keeps the claim for recovery when neither the reply nor the error reply can be written', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    const put = vi
      .spyOn(LocalRecordStore.prototype, 'putRecord')
      .mockRejectedValue(new Error('PDS unavailable'))
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    put.mockRestore()
    const claims = await h.db.selectFrom('turn_claim').select('reply_rkey').execute()
    expect(claims).toEqual([{ reply_rkey: '3uuuuuuuuuuu1.r0' }])
  })

  it('throws for an account that does not exist', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await expect(h.runner.start('did:plc:nobody', skey, '3uuuuuuuuuuu1')).rejects.toThrow()
  })

  it('publishes stream events that a late subscriber replays before following live', async () => {
    const h = await turnsHarness({
      model: () => scriptedModel(textReply('abc'), { delayMs: 15 }).model,
    })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await new Promise((resolve) => setTimeout(resolve, 60))
    const seen: string[] = []
    await new Promise<void>((resolve) =>
      h.hub.subscribe(h.runner.streamKey(ALICE, skey, '3uuuuuuuuuuu1.r0'), (event) => {
        seen.push(event.type)
        if (event.type === 'status') resolve()
      }),
    )
    expect(seen[0]).toBe('part-start')
    expect(seen.filter((t) => t === 'delta')).toHaveLength(3)
    expect(seen.at(-1)).toBe('status')
  })

  it('works the same for a local account', async () => {
    const h = await turnsHarness({ storageMode: 'local' })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    expect((await h.messages(skey)).get('3uuuuuuuuuuu1.r0')?.status).toBe('complete')
  })
})

describe('turns started from sync', () => {
  it('starts a turn for a live direct write with a generation request', async () => {
    const h = await turnsHarness()
    h.runner.attach(h.events)
    const { skey } = await h.chats.createConversation()
    await h.engine.syncConversation(ALICE, skey)
    await h.external.createRecord(
      h.chats.conversationUri(skey),
      nsid.message,
      '3uuuuuuuuuuu1',
      userMessage('from a client', { generation: {} }) as never,
    )
    await h.engine.syncConversation(ALICE, skey)
    await vi.waitFor(async () =>
      expect((await h.messages(skey)).get('3uuuuuuuuuuu1.r0')?.status).toBe('complete'),
    )
  })

  it('answers recent backfilled messages and ignores old ones', async () => {
    const h = await turnsHarness()
    h.runner.attach(h.events)
    const { skey } = await h.chats.createConversation()
    const uri = h.chats.conversationUri(skey)
    const old = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    await h.external.createRecord(
      uri,
      nsid.message,
      '3uuuuuuuuuuu1',
      userMessage('old', { generation: {}, createdAt: old }) as never,
    )
    await h.external.createRecord(
      uri,
      nsid.message,
      '3uuuuuuuuuuu2',
      userMessage('recent', { generation: {} }) as never,
    )
    await h.engine.syncConversation(ALICE, skey)
    await vi.waitFor(async () =>
      expect((await h.messages(skey)).get('3uuuuuuuuuuu2.r0')?.status).toBe('complete'),
    )
    expect((await h.messages(skey)).has('3uuuuuuuuuuu1.r0')).toBe(false)
  })

  it('answers an invalid direct write with an error reply quoting the validation error', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await h.runner.answerInvalid({
      did: ALICE,
      skey,
      rkey: '3uuuuuuuuuuu1',
      raw: { role: 'user', generation: { attempt: 2 } },
      error: 'Missing required key "content"',
    })
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r2')
    expect(reply).toMatchObject({ status: 'error', parent: '3uuuuuuuuuuu1' })
    expect(reply?.error).toContain('Missing required key "content"')
  })
})

describe('TurnRunner.recover', () => {
  it('marks this server interrupted replies and leaves other pending replies alone', async () => {
    const h = await turnsHarness()
    const { skey, uri } = await h.chats.createConversation()
    const pending = {
      $type: nsid.message,
      role: 'assistant',
      content: textContent(''),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    await h.chats.createMessage(skey, 'ours.r0', pending as never)
    await h.chats.createMessage(skey, 'theirs.r0', pending as never)
    await h.db
      .insertInto('turn_claim')
      .values({ conversation_uri: uri, reply_rkey: 'ours.r0', owner_did: ALICE, claimed_at: 'now' })
      .execute()
    await h.runner.recover()
    const all = await h.messages(skey)
    expect(all.get('ours.r0')).toMatchObject({ status: 'error', error: 'interrupted' })
    expect(all.get('theirs.r0')?.status).toBe('pending')
    expect(await h.db.selectFrom('turn_claim').selectAll().execute()).toEqual([])
  })

  it('keeps the claim of a reply it could not mark, so the next restart tries again', async () => {
    const h = await turnsHarness()
    const { skey, uri } = await h.chats.createConversation()
    await h.chats.createMessage(skey, 'ours.r0', {
      $type: nsid.message,
      role: 'assistant',
      content: textContent(''),
      status: 'pending',
      createdAt: new Date().toISOString(),
    } as never)
    await h.db
      .insertInto('turn_claim')
      .values({ conversation_uri: uri, reply_rkey: 'ours.r0', owner_did: ALICE, claimed_at: 'now' })
      .execute()
    const put = vi
      .spyOn(LocalRecordStore.prototype, 'putRecord')
      .mockRejectedValue(new Error('PDS unavailable'))
    await h.runner.recover()
    put.mockRestore()
    expect(await h.db.selectFrom('turn_claim').select('reply_rkey').execute()).toEqual([
      { reply_rkey: 'ours.r0' },
    ])
  })

  it('retries recent queued turns and drops old ones', async () => {
    const h = await turnsHarness()
    const { skey, uri } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    await sendUser(h, skey, '3uuuuuuuuuuu2')
    await h.db
      .insertInto('turn_request')
      .values([
        {
          conversation_uri: uri,
          message_rkey: '3uuuuuuuuuuu1',
          attempt: 0,
          owner_did: ALICE,
          requested_at: new Date().toISOString(),
        },
        {
          conversation_uri: uri,
          message_rkey: '3uuuuuuuuuuu2',
          attempt: 0,
          owner_did: ALICE,
          requested_at: '2020-01-01T00:00:00.000Z',
        },
      ])
      .execute()
    await h.runner.recover()
    await h.runner.idle()
    const all = await h.messages(skey)
    expect(all.get('3uuuuuuuuuuu1.r0')?.status).toBe('complete')
    expect(all.has('3uuuuuuuuuuu2.r0')).toBe(false)
  })
})

describe('safeErrorMessage', () => {
  it('removes API keys and bearer tokens', () => {
    const message = safeErrorMessage(
      new Error('bad key sk-proj-abc12345678 and Bearer abc.def.ghi'),
    )
    expect(message).not.toMatch(/sk-proj|abc\.def\.ghi/)
  })
})

const tool = (name: string, fields: Partial<Tool<never>> = {}): Tool<never> => ({
  name,
  description: `The ${name} tool`,
  inputSchema: z.object({}) as never,
  run: async () => `output of ${name}`,
  ...fields,
})

function hostWith(tools: Tool<never>[], sources: ToolSource[] = []) {
  return loadPlugins(
    [
      definePlugin({
        id: 'tools',
        name: 'Tools',
        apiVersion: 1,
        setup: (ctx) => {
          for (const item of tools) ctx.tools.register(item)
          for (const source of sources) ctx.toolSources.register(source)
        },
      }),
    ],
    {
      services: {} as never,
      logger: pino({ level: 'silent' }),
      app: { name: 'T', publicUrl: 'http://x' },
    },
  )
}

/** Send one message and wait for its reply. */
async function turn(
  h: Awaited<ReturnType<typeof turnsHarness>>,
  generation: Record<string, unknown> = {},
  skey?: string,
  rkey = '3uuuuuuuuuuu1',
) {
  const conversation = skey ?? (await h.chats.createConversation()).skey
  await sendUser(h, conversation, rkey, { generation })
  await h.runner.start(ALICE, conversation, rkey)
  await h.runner.idle()
  return { skey: conversation, reply: (await h.messages(conversation)).get(`${rkey}.r0`) }
}

const replyParts = (reply: unknown) =>
  (reply as { content: { parts: Record<string, unknown>[] } }).content.parts

describe('TurnRunner tools', () => {
  it('offers default-enabled tools when the message names none', async () => {
    const script = sequenceModel([textReply('ok')])
    const host = await hostWith([tool('on', { defaultEnabled: true }), tool('off')])
    const h = await turnsHarness({ host, model: () => script.model })
    await turn(h)
    expect(script.offered[0]).toEqual(['on'])
  })

  it("uses the user's choice for a switchable tool and ignores it for others", async () => {
    const script = sequenceModel([textReply('ok')])
    const host = await hostWith([
      tool('chosen', { userToggle: true }),
      tool('forced', { defaultEnabled: true }),
    ])
    const h = await turnsHarness({ host, model: () => script.model })
    await writeToolChoice(h.db, ALICE, 'chosen', true)
    await writeToolChoice(h.db, ALICE, 'forced', false)
    await turn(h)
    expect(script.offered[0]).toEqual(['chosen', 'forced'])
  })

  it('uses an explicit tool list exactly, including an empty one', async () => {
    const script = sequenceModel([textReply('ok')])
    const host = await hostWith([tool('on', { defaultEnabled: true }), tool('off')])
    const h = await turnsHarness({ host, model: () => script.model })
    const { skey } = await turn(h, { tools: ['off'] })
    await turn(h, { tools: [] }, skey, '3uuuuuuuuuuu2')
    expect(script.offered).toEqual([['off'], []])
  })

  it('runs without enabled tools, instead of failing, on a model that cannot use tools', async () => {
    const script = sequenceModel([textReply('ok')])
    const host = await hostWith([tool('on', { defaultEnabled: true })])
    const h = await turnsHarness({
      host,
      model: () => script.model,
      adminModels: [
        {
          id: 'plain',
          default: true,
          capabilities: { vision: false, reasoning: false, tools: false },
        },
      ],
    })
    const { reply } = await turn(h)
    expect(reply?.status).toBe('complete')
    expect(script.offered[0]).toEqual([])
  })

  it('wraps untrusted tool output for the model and stores it raw', async () => {
    const script = sequenceModel([toolCall('web'), textReply('Done.')])
    const host = await hostWith([tool('web', { defaultEnabled: true, untrusted: true })])
    const h = await turnsHarness({ host, model: () => script.model })
    const { reply } = await turn(h)
    const sent = JSON.stringify(script.prompts[1])
    expect(sent).toMatch(/<untrusted_tool_output id=\\"[0-9a-f]{32}\\">/)
    expect(sent).toContain('output of web')
    const result = replyParts(reply).find((p) => String(p.$type).endsWith('toolResultPart'))
    expect(result?.output).toBe('output of web')
  })

  it('does not wrap output from a tool without untrusted', async () => {
    const script = sequenceModel([toolCall('calc'), textReply('Done.')])
    const host = await hostWith([tool('calc', { defaultEnabled: true })])
    const h = await turnsHarness({ host, model: () => script.model })
    await turn(h)
    expect(JSON.stringify(script.prompts[1])).not.toContain('untrusted_tool_output')
  })

  it('wraps untrusted output again, with a new boundary, when a later turn replays it', async () => {
    const script = sequenceModel([toolCall('web'), textReply('Done.'), textReply('Again.')])
    const host = await hostWith([tool('web', { defaultEnabled: true, untrusted: true })])
    const h = await turnsHarness({ host, model: () => script.model })
    const { skey } = await turn(h)
    await sendUser(h, skey, '3uuuuuuuuuuu2', { parent: '3uuuuuuuuuuu1.r0', generation: {} })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.idle()
    const boundary = (prompt: unknown) =>
      JSON.stringify(prompt).match(/untrusted_tool_output id=\\"([0-9a-f]{32})/)?.[1]
    expect(boundary(script.prompts[2])).toBeDefined()
    expect(boundary(script.prompts[2])).not.toBe(boundary(script.prompts[1]))
  })

  it('wraps replayed output from a tool that is no longer registered', async () => {
    const first = sequenceModel([toolCall('calc'), textReply('Done.')])
    const h = await turnsHarness({
      host: await hostWith([tool('calc', { defaultEnabled: true })]),
      model: () => first.model,
    })
    const { skey } = await turn(h)
    const later = sequenceModel([textReply('Again.')])
    const without = await turnsHarness({ model: () => later.model })
    const messages = (await h.chats.getConversation(skey)).messages
    const replay = await without.chats.createConversation()
    for (const message of messages)
      await without.chats.createMessage(replay.skey, message.rkey, message.value as never)
    await sendUser(without, replay.skey, '3uuuuuuuuuuu2', {
      parent: '3uuuuuuuuuuu1.r0',
      generation: {},
    })
    await without.runner.start(ALICE, replay.skey, '3uuuuuuuuuuu2')
    await without.runner.idle()
    expect(JSON.stringify(later.prompts[0])).toContain('untrusted_tool_output')
  })

  it('wraps output from tool sources', async () => {
    const script = sequenceModel([toolCall('mcp_lookup'), textReply('Done.')])
    const source: ToolSource = {
      id: 'mcp',
      list: async () => [
        { name: 'lookup', description: 'Look up', inputSchema: { type: 'object' } },
      ],
      call: async () => 'from the source',
    }
    const h = await turnsHarness({ host: await hostWith([], [source]), model: () => script.model })
    await turn(h, { tools: ['mcp_lookup'] })
    expect(JSON.stringify(script.prompts[1])).toContain('untrusted_tool_output')
  })

  it('gives tools a context that cites sources into the reply', async () => {
    const script = sequenceModel([toolCall('web'), textReply('Done.')])
    const web = tool('web', {
      defaultEnabled: true,
      run: async (_input, context) => {
        context.cite({ url: 'https://example.com', title: 'Example' })
        return 'page'
      },
    })
    const h = await turnsHarness({ host: await hostWith([web]), model: () => script.model })
    const { reply } = await turn(h)
    expect(replyParts(reply)).toContainEqual({
      $type: `${nsid.defs}#sourcePart`,
      url: 'https://example.com',
      title: 'Example',
    })
  })

  it('keeps a turn cache private to each tool, and empty in the next turn', async () => {
    const script = sequenceModel([
      toolCall('a', 'c1'),
      toolCall('a', 'c2'),
      toolCall('b', 'c3'),
      textReply('Done.'),
      toolCall('a', 'c4'),
      textReply('Again.'),
    ])
    const seen: Record<string, unknown[]> = { a: [], b: [] }
    const counter = (name: string) =>
      tool(name, {
        defaultEnabled: true,
        run: async (_input, context: ToolContext) => {
          const count = ((context.turnCache.get('count') as number | undefined) ?? 0) + 1
          context.turnCache.set('count', count)
          seen[name]?.push(count)
          return String(count)
        },
      })
    const h = await turnsHarness({
      host: await hostWith([counter('a'), counter('b')]),
      model: () => script.model,
    })
    const { skey } = await turn(h)
    await sendUser(h, skey, '3uuuuuuuuuuu2', { parent: '3uuuuuuuuuuu1.r0', generation: {} })
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu2')
    await h.runner.idle()
    expect(seen).toEqual({ a: [1, 2, 1], b: [1] })
  })
})

describe('TurnRunner and the admin area', () => {
  it('does not start a turn for a user without access', async () => {
    const h = await turnsHarness({ hasAccess: async () => false })
    const { skey } = await h.chats.createConversation()
    await sendUser(h, skey, '3uuuuuuuuuuu1')
    expect(await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')).toEqual({ status: 'skipped' })
    expect((await h.messages(skey)).size).toBe(1)
  })

  it('reads a new system prompt and app name at the next turn', async () => {
    const script = sequenceModel([textReply('ok')])
    let name = 'First Name'
    const h = await turnsHarness({
      model: () => script.model,
      systemPrompt: 'First prompt in {{appName}}.',
      appName: () => name,
    })
    await turn(h)
    h.settings.systemPrompt = 'Second prompt in {{appName}}.'
    name = 'Second Name'
    await turn(h, {}, undefined, '3uuuuuuuuuuu2')
    const instructions = script.prompts.map((prompt) =>
      JSON.stringify((prompt as { role: string }[]).find((m) => m.role === 'system')),
    )
    expect(instructions[0]).toContain('First prompt in First Name.')
    expect(instructions[1]).toContain('Second prompt in Second Name.')
  })

  it("gives tools the user's roles", async () => {
    const script = sequenceModel([toolCall('whoami'), textReply('done')])
    let seen: string[] = []
    const host = await hostWith([
      tool('whoami', {
        defaultEnabled: true,
        run: async (_input, context) => {
          seen = context.roles
          return 'ok'
        },
      }),
    ])
    const h = await turnsHarness({
      host,
      model: () => script.model,
      rolesOf: async () => ['user', 'member'],
    })
    await turn(h)
    expect(seen).toEqual(['user', 'member'])
  })

  it('finishes a turn with the plugins it started with when the plugins change mid-turn', async () => {
    const script = sequenceModel([toolCall('calc'), textReply('done')])
    const calls: string[] = []
    const closed: string[] = []
    const host = await loadPlugins(
      [
        definePlugin({
          id: 'old',
          name: 'Old',
          apiVersion: 1,
          setup: (ctx) => {
            ctx.tools.register(
              tool('calc', {
                defaultEnabled: true,
                run: async () => {
                  calls.push('old calc')
                  h.plugins.swap({ ...h.plugins.current(), host: replacement })
                  return 'ok'
                },
              }),
            )
            ctx.onClose(() => void closed.push('old'))
          },
        }),
      ],
      {
        services: {} as never,
        logger: pino({ level: 'silent' }),
        app: { name: 'T', publicUrl: 'x' },
      },
    )
    const replacement = await loadPlugins([], {
      services: {} as never,
      logger: pino({ level: 'silent' }),
      app: { name: 'T', publicUrl: 'x' },
    })
    const h = await turnsHarness({ host, model: () => script.model })
    const { reply } = await turn(h)
    expect(calls).toEqual(['old calc'])
    expect(reply?.status).toBe('complete')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closed).toEqual(['old'])
    expect(h.plugins.current().host).toBe(replacement)
  })
})
