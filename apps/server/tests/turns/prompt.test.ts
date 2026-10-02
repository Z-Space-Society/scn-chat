import { nsid } from '@scn-chat/lexicons'
import type { BranchMessage, ModelProvider } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import {
  branchTo,
  buildInstructions,
  fillBasePrompt,
  lastReplyModel,
  TurnInputError,
  timeZoneOf,
  toModelMessages,
} from '../../src/turns/prompt.ts'

const d = (name: string) => `${nsid.defs}#${name}`
const msg = (rkey: string, record: Record<string, unknown>): BranchMessage => ({
  rkey,
  author: 'did:plc:a',
  record: record as never,
})
const content = (...parts: Record<string, unknown>[]) => ({ $type: d('plainContent'), parts })
const text = (value: string, extra: Record<string, unknown> = {}) => ({
  $type: d('textPart'),
  text: value,
  ...extra,
})
const caps = { vision: true, reasoning: true, tools: true }
const provider = (id: string, replay: 'replay' | 'drop' = 'replay') =>
  ({ id, replay }) as ModelProvider
const noBlobs = async () => ({ bytes: new Uint8Array(), mimeType: 'text/plain' })
const trusted = () => false

describe('branchTo', () => {
  it('follows parent keys from the root to the message, leaving out other branches', () => {
    const messages = new Map([
      ['a', msg('a', { role: 'user' })],
      ['a.r0', msg('a.r0', { role: 'assistant', parent: 'a' })],
      ['b', msg('b', { role: 'user', parent: 'a.r0' })],
      ['sibling', msg('sibling', { role: 'user', parent: 'a.r0' })],
    ])
    expect(branchTo(messages, 'b').map((m) => m.rkey)).toEqual(['a', 'a.r0', 'b'])
  })

  it('stops at a cycle', () => {
    const messages = new Map([
      ['a', msg('a', { role: 'user', parent: 'b' })],
      ['b', msg('b', { role: 'user', parent: 'a' })],
    ])
    expect(branchTo(messages, 'a').map((m) => m.rkey)).toEqual(['b', 'a'])
  })
})

describe('lastReplyModel', () => {
  it('returns the model of the nearest completed reply', () => {
    const branch = [
      msg('a.r0', { role: 'assistant', status: 'complete', model: { provider: 'p', id: 'old' } }),
      msg('b.r0', { role: 'assistant', status: 'complete', model: { provider: 'p', id: 'new' } }),
      msg('c.r0', { role: 'assistant', status: 'error', model: { provider: 'p', id: 'broken' } }),
    ]
    expect(lastReplyModel(branch)).toEqual({ provider: 'p', id: 'new' })
  })
})

describe('buildInstructions', () => {
  it('joins the base prompt, custom instructions, and the system prompt with blank lines', () => {
    expect(
      buildInstructions(
        'Base',
        { customInstructions: 'Metric units' },
        { systemPrompt: 'Be brief' },
      ),
    ).toBe('Base\n\nMetric units\n\nBe brief')
  })
})

describe('fillBasePrompt', () => {
  const now = new Date('2026-09-30T02:30:00Z')

  it('fills the date, time, time zone, and app name in the given zone', () => {
    const filled = fillBasePrompt('{{appName}}: {{date}} {{time}} {{timezone}}', {
      appName: 'SCN Chat',
      timeZone: 'America/Vancouver',
      now,
    })
    expect(filled).toBe('SCN Chat: Tuesday, September 29, 2026 7:30 PM America/Vancouver')
  })

  it('keeps unknown placeholders as written', () => {
    expect(fillBasePrompt('Hi {{name}}', { appName: 'A', timeZone: 'UTC', now })).toBe(
      'Hi {{name}}',
    )
  })
})

describe('timeZoneOf', () => {
  const logger = pino({ level: 'silent' })

  it('falls back to UTC and warns for a zone that does not exist', () => {
    const warn = vi.spyOn(logger, 'warn')
    expect(timeZoneOf({ timezone: 'Mars/Olympus' }, logger)).toBe('UTC')
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('toModelMessages', () => {
  it('leaves out errored and pending replies and keeps cancelled ones', async () => {
    const branch = [
      msg('a', { role: 'user', content: content(text('q1')) }),
      msg('a.r0', {
        role: 'assistant',
        status: 'error',
        model: { provider: 'p', id: 'm' },
        content: content(text('boom')),
      }),
      msg('b', { role: 'user', content: content(text('q2')) }),
      msg('b.r0', {
        role: 'assistant',
        status: 'cancelled',
        model: { provider: 'p', id: 'm' },
        content: content(text('partial')),
      }),
      msg('c', { role: 'user', content: content(text('q3')) }),
      msg('c.r0', { role: 'assistant', status: 'pending', content: content() }),
    ]
    const messages = await toModelMessages(branch, {
      provider: provider('p'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(JSON.stringify(messages)).not.toContain('boom')
    expect(JSON.stringify(messages)).toContain('partial')
    expect(messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user'])
  })

  it('replays reasoning and provider data only for the same provider with a replay policy', async () => {
    const reply = (provider: string) =>
      msg('r', {
        role: 'assistant',
        status: 'complete',
        model: { provider, id: 'm' },
        content: content(
          {
            $type: d('reasoningPart'),
            text: 'thinking',
            providerData: JSON.stringify({ anthropic: { signature: 'SIG' } }),
          },
          text('answer', { providerData: JSON.stringify({ google: { thoughtSignature: 'T' } }) }),
        ),
      })
    const same = await toModelMessages([reply('anthropic')], {
      provider: provider('anthropic'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(JSON.stringify(same)).toContain('SIG')
    expect(JSON.stringify(same)).toContain('"type":"reasoning"')
    const other = await toModelMessages([reply('anthropic')], {
      provider: provider('openai'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(JSON.stringify(other)).not.toContain('SIG')
    expect(JSON.stringify(other)).not.toContain('reasoning')
    const dropping = await toModelMessages([reply('local')], {
      provider: provider('local', 'drop'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(JSON.stringify(dropping)).not.toContain('thinking')
  })

  it('splits tool calls and results into assistant and tool messages', async () => {
    const branch = [
      msg('r', {
        role: 'assistant',
        status: 'complete',
        model: { provider: 'p', id: 'm' },
        content: content(
          {
            $type: d('toolCallPart'),
            callId: 'c1',
            tool: 'search',
            input: '{"q":"x","lat":49.28}',
          },
          { $type: d('toolResultPart'), callId: 'c1', output: 'found it' },
          text('done'),
        ),
      }),
    ]
    const messages = await toModelMessages(branch, {
      provider: provider('p'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant'])
    expect(JSON.stringify(messages[0])).toContain('"lat":49.28')
    expect(JSON.stringify(messages[1])).toContain('"toolName":"search"')
  })

  it('sends images as file parts and extracted file text as a headed text part', async () => {
    const blobs: Record<string, { bytes: Uint8Array; mimeType: string }> = {
      img: { bytes: new Uint8Array([1, 2]), mimeType: 'image/png' },
      txt: { bytes: new TextEncoder().encode('PDF body'), mimeType: 'text/plain' },
    }
    const branch = [
      msg('a', {
        role: 'user',
        content: content(
          {
            $type: d('imagePart'),
            image: { $type: 'blob', ref: { $link: 'img' }, mimeType: 'image/png', size: 2 },
          },
          {
            $type: d('filePart'),
            name: 'report.pdf',
            file: {},
            extracted: { text: { ref: { $link: 'txt' } }, method: 'text' },
          },
          { $type: d('filePart'), name: 'scan.pdf', file: {} },
        ),
      }),
    ]
    const [user] = await toModelMessages(branch, {
      provider: provider('p'),
      capabilities: caps,
      readBlob: async (cid) => blobs[cid] as never,
      isUntrusted: trusted,
    })
    const parts = user?.content as { type: string; text?: string; mediaType?: string }[]
    expect(parts[0]).toMatchObject({ type: 'file', mediaType: 'image/png' })
    expect(parts[1]?.text).toMatch(/report\.pdf[\s\S]*PDF body/)
    expect(parts[2]?.text).toContain('scan.pdf')
  })

  it('refuses images for a model without vision', async () => {
    const branch = [
      msg('a', {
        role: 'user',
        content: content({ $type: d('imagePart'), image: { ref: { $link: 'x' } } }),
      }),
    ]
    await expect(
      toModelMessages(branch, {
        provider: provider('p'),
        capabilities: { ...caps, vision: false },
        readBlob: noBlobs,
        isUntrusted: trusted,
      }),
    ).rejects.toBeInstanceOf(TurnInputError)
  })

  it('throws on a tool result with no tool call before it', async () => {
    const branch = [
      msg('r', {
        role: 'assistant',
        status: 'complete',
        content: content({ $type: d('toolResultPart'), callId: 'c9', output: 'orphan' }),
      }),
    ]
    await expect(
      toModelMessages(branch, {
        provider: provider('p'),
        capabilities: caps,
        readBlob: noBlobs,
        isUntrusted: trusted,
      }),
    ).rejects.toThrow(/c9/)
  })

  it('throws on tool input that is not JSON', async () => {
    const branch = [
      msg('r', {
        role: 'assistant',
        status: 'complete',
        content: content(
          { $type: d('toolCallPart'), callId: 'c1', tool: 't', input: '{"q": ' },
          { $type: d('toolResultPart'), callId: 'c1', output: 'x' },
        ),
      }),
    ]
    await expect(
      toModelMessages(branch, {
        provider: provider('p'),
        capabilities: caps,
        readBlob: noBlobs,
        isUntrusted: trusted,
      }),
    ).rejects.toBeInstanceOf(SyntaxError)
  })

  it('refuses encrypted content', async () => {
    const branch = [msg('a', { role: 'user', content: { $type: d('encryptedContent') } })]
    await expect(
      toModelMessages(branch, {
        provider: provider('p'),
        capabilities: caps,
        readBlob: noBlobs,
        isUntrusted: trusted,
      }),
    ).rejects.toBeInstanceOf(TurnInputError)
  })

  it('leaves out a tool call that never got a result, as in a reply cancelled mid-call', async () => {
    const branch = [
      msg('r', {
        role: 'assistant',
        status: 'cancelled',
        model: { provider: 'p', id: 'm' },
        content: content(text('Let me look'), {
          $type: d('toolCallPart'),
          callId: 'c1',
          tool: 'search',
          input: '{}',
        }),
      }),
    ]
    const messages = await toModelMessages(branch, {
      provider: provider('p'),
      capabilities: caps,
      readBlob: noBlobs,
      isUntrusted: trusted,
    })
    expect(JSON.stringify(messages)).not.toContain('tool-call')
    expect(JSON.stringify(messages)).toContain('Let me look')
  })
})
