import { nsid } from '@scn-chat/lexicons'
import { definePlugin, type TurnContext } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { loadPlugins } from '../../src/plugins/host.ts'
import { safeErrorMessage } from '../../src/safe-error.ts'
import { LocalRecordStore } from '../../src/storage/local-record-store.ts'
import { ALICE, textContent, userMessage } from '../helpers/spaces.ts'
import { scriptedModel, sequenceModel, textReply, turnsHarness } from '../helpers/turns.ts'

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
    expect(String(result?.output)).toMatch(/stored as a blob/)
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

  it('fails the turn on encrypted messages', async () => {
    const h = await turnsHarness()
    const { skey } = await h.chats.createConversation()
    await h.chats.createMessage(skey, '3uuuuuuuuuuu1', {
      ...userMessage('x', { generation: {} }),
      content: {
        $type: `${nsid.defs}#encryptedContent`,
        scheme: 'test',
        keyId: 'k',
        nonce: { $bytes: 'AAAAAAAAAAAAAAAA' },
        ciphertext: { $bytes: 'AAAA' },
      },
    } as never)
    await h.runner.start(ALICE, skey, '3uuuuuuuuuuu1')
    await h.runner.idle()
    const reply = (await h.messages(skey)).get('3uuuuuuuuuuu1.r0')
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('encrypted') })
  })

  it('fails the turn when it asks for tools on a model that cannot use them', async () => {
    const h = await turnsHarness({
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
    expect(reply).toMatchObject({
      status: 'error',
      error: expect.stringContaining('cannot use tools'),
    })
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
    await expect(h.runner.start('did:plc:nobody', skey, '3uuuuuuuuuuu1')).rejects.toThrow(
      /No account/,
    )
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
    expect(safeErrorMessage(new Error('bad key sk-proj-abc12345678 and Bearer abc.def.ghi'))).toBe(
      'bad key [redacted] and Bearer [redacted]',
    )
  })
})
