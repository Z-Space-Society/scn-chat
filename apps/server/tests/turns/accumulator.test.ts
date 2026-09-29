import type { TextStreamPart, ToolSet } from 'ai'
import { describe, expect, it } from 'vitest'
import { PartAccumulator, type StreamEvent } from '../../src/turns/accumulator.ts'

/** A stream part with only the fields the accumulator reads. */
const part = (chunk: object) => chunk as TextStreamPart<ToolSet>

describe('PartAccumulator', () => {
  it('maps stream parts to lexicon parts in order, JSON-encoding tool input and output', () => {
    const events: StreamEvent[] = []
    const acc = new PartAccumulator((event) => events.push(event))
    for (const chunk of [
      { type: 'reasoning-start', id: 'r' },
      { type: 'reasoning-delta', id: 'r', text: 'hmm' },
      { type: 'reasoning-end', id: 'r', providerMetadata: { anthropic: { signature: 'SIG' } } },
      { type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: { q: 'x', lat: 49.28 } },
      { type: 'tool-result', toolCallId: 'c1', toolName: 'search', output: { hits: 2 } },
      { type: 'tool-error', toolCallId: 'c2', toolName: 'fetch', error: new Error('timeout') },
      { type: 'source', sourceType: 'url', id: 's', url: 'https://weather.gc.ca', title: 'EC' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', text: 'Hel' },
      { type: 'text-delta', id: 't', text: 'lo' },
      { type: 'text-end', id: 't' },
      {
        type: 'finish',
        totalUsage: {
          inputTokens: 10,
          outputTokens: 5,
          outputTokenDetails: { reasoningTokens: 2 },
        },
      },
    ]) {
      expect(acc.push(part(chunk))).toBeUndefined()
    }
    expect(acc.parts).toEqual([
      {
        $type: 'network.sharedcomputer.chat.defs#reasoningPart',
        text: 'hmm',
        providerData: '{"anthropic":{"signature":"SIG"}}',
      },
      {
        $type: 'network.sharedcomputer.chat.defs#toolCallPart',
        callId: 'c1',
        tool: 'search',
        input: '{"q":"x","lat":49.28}',
      },
      {
        $type: 'network.sharedcomputer.chat.defs#toolResultPart',
        callId: 'c1',
        output: '{"hits":2}',
      },
      {
        $type: 'network.sharedcomputer.chat.defs#toolResultPart',
        callId: 'c2',
        output: 'timeout',
        isError: true,
      },
      {
        $type: 'network.sharedcomputer.chat.defs#sourcePart',
        url: 'https://weather.gc.ca',
        title: 'EC',
      },
      { $type: 'network.sharedcomputer.chat.defs#textPart', text: 'Hello' },
    ])
    expect(acc.lexiconUsage()).toEqual({ inputTokens: 10, outputTokens: 5, reasoningTokens: 2 })
    expect(
      events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text),
    ).toEqual(['hmm', 'Hel', 'lo'])
  })

  it('keeps provider metadata that arrives on a part start or delta, as Google sends signatures', () => {
    const acc = new PartAccumulator()
    const signature = { google: { thoughtSignature: 'SIG' } }
    for (const chunk of [
      { type: 'reasoning-start', id: 'r', providerMetadata: signature },
      { type: 'reasoning-delta', id: 'r', text: 'hmm', providerMetadata: signature },
      { type: 'reasoning-end', id: 'r' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', text: 'Hi', providerMetadata: signature },
      { type: 'text-end', id: 't' },
    ])
      acc.push(part(chunk))
    expect(acc.parts.map((p) => p.providerData)).toEqual([
      JSON.stringify(signature),
      JSON.stringify(signature),
    ])
  })

  it('stores unparsable tool input JSON-encoded, so it replays as the string the model sent', () => {
    const acc = new PartAccumulator()
    acc.push(part({ type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: '{"q": ' }))
    expect(JSON.parse(acc.parts[0]?.input as string)).toBe('{"q": ')
  })

  it('fails the turn on a generated file, which the lexicon cannot hold yet', () => {
    expect(new PartAccumulator().push(part({ type: 'file', file: {} }))).toBeInstanceOf(Error)
  })

  it('returns the error from an error part', () => {
    const error = new Error('401 Unauthorized')
    expect(new PartAccumulator().push(part({ type: 'error', error }))).toBe(error)
  })

  it('leaves out usage fields that are missing', () => {
    const acc = new PartAccumulator()
    acc.push(part({ type: 'finish', totalUsage: { inputTokens: 3, outputTokenDetails: {} } }))
    expect(acc.lexiconUsage()).toEqual({ inputTokens: 3 })
  })

  it('adds a cited source as a source part', () => {
    const acc = new PartAccumulator()
    acc.cite({ url: 'https://example.com/a', title: 'Example' })
    expect(acc.parts).toEqual([
      {
        $type: 'network.sharedcomputer.chat.defs#sourcePart',
        url: 'https://example.com/a',
        title: 'Example',
      },
    ])
  })

  it('ignores cited URLs that are not http or https', () => {
    const acc = new PartAccumulator()
    acc.cite({ url: 'javascript:alert(1)' })
    acc.cite({ url: 'not a url' })
    acc.cite({ url: 'ftp://example.com/file' })
    expect(acc.parts).toEqual([])
  })

  it('skips a URL the reply already cites, whether from a tool or the provider', () => {
    const acc = new PartAccumulator()
    acc.push(part({ type: 'source', sourceType: 'url', id: 's', url: 'https://example.com' }))
    acc.cite({ url: 'https://example.com/' })
    acc.cite({ url: 'https://example.com/b' })
    acc.cite({ url: 'https://example.com/b', title: 'Again' })
    expect(acc.parts.map((p) => p.url)).toEqual(['https://example.com', 'https://example.com/b'])
  })

  it("cuts a cited title to the lexicon's 300 graphemes", () => {
    const acc = new PartAccumulator()
    acc.cite({ url: 'https://example.com', title: 'e\u0301'.repeat(400) })
    expect([...new Intl.Segmenter().segment(acc.parts[0]?.title as string)]).toHaveLength(300)
  })
})
