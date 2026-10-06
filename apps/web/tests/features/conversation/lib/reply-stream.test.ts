import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEvent,
  noParts,
  type ReplyEvent,
  replyEvents,
  streamedReply,
} from '../../../../src/features/conversation/lib/reply-stream.ts'

class FakeEventSource {
  static last: FakeEventSource
  listeners = new Map<string, ((event: { data: string }) => void)[]>()
  onerror: (() => void) | null = null
  closed = false
  constructor() {
    FakeEventSource.last = this
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data: object) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) })
  }
  close() {
    this.closed = true
  }
}

beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource))
afterEach(() => vi.unstubAllGlobals())

/** Collect a stream's events until it ends, or the error it ends with. */
async function collect(events: AsyncGenerator<ReplyEvent>) {
  const seen: ReplyEvent[] = []
  try {
    for await (const event of events) seen.push(event)
    return { seen }
  } catch (error) {
    return { seen, error }
  }
}

describe('replyEvents', () => {
  it('yields events in order and ends after the status, closing the connection', async () => {
    const done = collect(replyEvents('/stream', new AbortController().signal))
    const source = FakeEventSource.last
    source.emit('part-start', { index: 0, partType: 'textPart' })
    source.emit('delta', { index: 0, text: 'Hi' })
    source.emit('status', { status: 'complete' })
    source.emit('delta', { index: 0, text: ' after' })
    expect((await done).seen).toEqual([
      { type: 'part-start', index: 0, partType: 'textPart' },
      { type: 'delta', index: 0, text: 'Hi' },
      { type: 'status', status: 'complete' },
    ])
    expect(source.closed).toBe(true)
  })

  it('throws when the connection drops before the status', async () => {
    const done = collect(replyEvents('/stream', new AbortController().signal))
    const source = FakeEventSource.last
    source.emit('delta', { index: 0, text: 'Hi' })
    source.onerror?.()
    const { seen, error } = await done
    expect(seen).toHaveLength(1)
    expect(error).toBeInstanceOf(Error)
    expect(source.closed).toBe(true)
  })

  it('stops and closes the connection when aborted', async () => {
    const abort = new AbortController()
    const done = collect(replyEvents('/stream', abort.signal))
    abort.abort()
    expect(await done).toEqual({ seen: [] })
    expect(FakeEventSource.last.closed).toBe(true)
  })
})

describe('streamedReply', () => {
  it('joins text parts and reasoning parts apart, in index order', () => {
    const events: ReplyEvent[] = [
      { type: 'part-start', index: 0, partType: 'reasoningPart' },
      { type: 'delta', index: 0, text: 'pondering' },
      { type: 'part-start', index: 1, partType: 'textPart' },
      { type: 'delta', index: 1, text: 'Hel' },
      { type: 'part-start', index: 2, partType: 'textPart' },
      { type: 'delta', index: 2, text: 'Second' },
      { type: 'delta', index: 1, text: 'lo' },
    ]
    const parts = events.reduce(addEvent, noParts)
    expect(streamedReply(parts)).toEqual({ text: 'Hello\n\nSecond', reasoning: 'pondering' })
  })

  it('keeps the final status', () => {
    expect(addEvent(noParts, { type: 'status', status: 'error' }).status).toBe('error')
  })
})
