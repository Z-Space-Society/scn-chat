import { describe, expect, it } from 'vitest'
import {
  addEvent,
  noParts,
  type ReplyEvent,
} from '../../../../src/features/conversation/lib/reply-stream.ts'

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
