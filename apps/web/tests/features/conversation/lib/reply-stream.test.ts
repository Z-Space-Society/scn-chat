import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEvent,
  noParts,
  type ReplyEvent,
  replyEvents,
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
    this.emitRaw(type, JSON.stringify(data))
  }
  emitRaw(type: string, data: string) {
    if (this.closed) return
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
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

  it('keeps the events sent before the connection drops, even unread', async () => {
    const events = replyEvents('/stream', new AbortController().signal)
    const first = events.next()
    const source = FakeEventSource.last
    source.emit('delta', { index: 0, text: 'Hi' })
    source.emit('delta', { index: 0, text: ' there' })
    source.onerror?.()
    expect((await first).value).toEqual({ type: 'delta', index: 0, text: 'Hi' })
    const { seen, error } = await collect(events)
    expect(seen).toEqual([{ type: 'delta', index: 0, text: ' there' }])
    expect(error).toBeInstanceOf(Error)
  })

  it('throws when an event is not JSON, closing the connection', async () => {
    const done = collect(replyEvents('/stream', new AbortController().signal))
    const source = FakeEventSource.last
    source.emitRaw('delta', 'not json')
    const { seen, error } = await done
    expect(seen).toEqual([])
    expect(error).toBeInstanceOf(SyntaxError)
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

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`

describe('addEvent', () => {
  it('builds parts in the shape of the record, in the order they started', () => {
    const call = { $type: d('toolCallPart'), callId: 'c', tool: 'web_search', input: '{}' }
    const events: ReplyEvent[] = [
      { type: 'part-start', index: 0, partType: 'reasoningPart' },
      { type: 'delta', index: 0, text: 'pondering' },
      { type: 'part', index: 1, part: call },
      { type: 'part-start', index: 2, partType: 'textPart' },
      { type: 'delta', index: 2, text: 'Hel' },
      { type: 'delta', index: 2, text: 'lo' },
    ]
    expect(events.reduce(addEvent, noParts).parts).toEqual([
      { $type: d('reasoningPart'), text: 'pondering' },
      call,
      { $type: d('textPart'), text: 'Hello' },
    ])
  })

  it('marks a queued turn until its first part arrives', () => {
    const queued = addEvent(noParts, { type: 'queued' })
    expect(queued.queued).toBe(true)
    expect(addEvent(queued, { type: 'part-start', index: 0, partType: 'textPart' }).queued).toBe(
      false,
    )
  })

  it('keeps the final status', () => {
    expect(addEvent(noParts, { type: 'status', status: 'error' }).status).toBe('error')
  })
})
