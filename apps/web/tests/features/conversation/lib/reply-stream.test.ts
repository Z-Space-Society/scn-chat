import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addEvent,
  addEvents,
  noParts,
  type ReplyEvent,
  replyEvents,
} from '../../../../src/features/conversation/lib/reply-stream.ts'
import { lastSource, stubEventSource } from '../../../helpers/event-source.ts'

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

describe('replyEvents', () => {
  beforeEach(stubEventSource)
  afterEach(() => vi.unstubAllGlobals())

  it('sends the events that arrive within a frame as one batch, and the status at once', async () => {
    const stream = replyEvents('/stream', new AbortController().signal)
    const first = stream.next()
    lastSource().emit('part-start', { index: 0, partType: 'textPart' })
    for (const letter of 'Hello') lastSource().emit('delta', { index: 0, text: letter })
    const batch = (await first).value as ReplyEvent[]
    expect(batch).toHaveLength(6)
    expect(addEvents(noParts, batch).parts[0]?.text).toBe('Hello')
    const second = stream.next()
    lastSource().emit('delta', { index: 0, text: '!' })
    lastSource().emit('status', { status: 'complete' })
    expect((await second).value).toEqual([
      { type: 'delta', index: 0, text: '!' },
      { type: 'status', status: 'complete' },
    ])
    expect((await stream.next()).done).toBe(true)
    expect(lastSource().closed).toBe(true)
  })

  it('sends what arrived before the stream dropped, then throws', async () => {
    const stream = replyEvents('/stream', new AbortController().signal)
    const first = stream.next()
    lastSource().emit('part-start', { index: 0, partType: 'textPart' })
    lastSource().onerror?.()
    expect((await first).value).toEqual([{ type: 'part-start', index: 0, partType: 'textPart' }])
    await expect(stream.next()).rejects.toThrow('The reply stream dropped')
  })
})
