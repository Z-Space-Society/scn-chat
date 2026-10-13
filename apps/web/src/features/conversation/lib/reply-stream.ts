import { nsid } from '@scn-chat/lexicons/nsid'
import type { HubEvent } from '@scn-chat/server/api-types'
import type { Part } from '../../../parts/types.ts'

/** A reply's stream events, as the server sends them. See TurnsApi's stream route. */
export type ReplyEvent = HubEvent

/** Statuses after which the reply's record is final. Others mean another server runs the reply. */
export const FINISHED = new Set(['complete', 'error', 'cancelled'])

/**
 * A reply's events from its stream endpoint. It ends after the status event, and throws if the
 * connection drops or sends an event it can't parse first. The connection closes when it ends or
 * the signal aborts.
 */
export async function* replyEvents(url: string, signal: AbortSignal): AsyncGenerator<ReplyEvent> {
  const source = new EventSource(url)
  let failure: unknown
  const events = new ReadableStream<ReplyEvent>({
    start(controller) {
      // A failure closes the stream rather than erroring it, which would drop the events not yet read.
      const end = (error?: unknown) => {
        failure = error
        source.close()
        controller.close()
      }
      for (const type of ['part-start', 'delta', 'part', 'queued', 'status'] as const)
        source.addEventListener(type, (event) => {
          try {
            controller.enqueue({ type, ...JSON.parse((event as MessageEvent).data) } as ReplyEvent)
          } catch (error) {
            return end(error)
          }
          if (type === 'status') end()
        })
      source.onerror = () => end(new Error('The reply stream dropped'))
    },
  })
  const reader = events.getReader()
  const cancel = () => void reader.cancel()
  signal.addEventListener('abort', cancel)
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      yield value
    }
    if (failure) throw failure
  } finally {
    signal.removeEventListener('abort', cancel)
    source.close()
  }
}

/**
 * A reply streamed so far: its parts in the shape of the final record, in the order the model
 * produced them, whether it waits for the rate limit, and the final status once sent.
 */
export type ReplyParts = { parts: Part[]; queued: boolean; status: string | null }

export const noParts: ReplyParts = { parts: [], queued: false, status: null }

export function addEvent(reply: ReplyParts, event: ReplyEvent): ReplyParts {
  switch (event.type) {
    case 'status':
      return { ...reply, status: event.status }
    case 'queued':
      return { ...reply, queued: true }
    case 'part-start':
      return setPart(reply, event.index, { $type: `${nsid.defs}#${event.partType}`, text: '' })
    case 'part':
      return setPart(reply, event.index, event.part as Part)
    case 'delta': {
      const part = reply.parts[event.index]
      if (!part) return reply
      return setPart(reply, event.index, {
        ...part,
        text: `${(part.text as string | undefined) ?? ''}${event.text}`,
      })
    }
  }
}

/** The reply with one part replaced. A part arriving means the turn has left the queue. */
function setPart(reply: ReplyParts, index: number, part: Part): ReplyParts {
  const parts = [...reply.parts]
  parts[index] = part
  return { ...reply, parts, queued: false }
}
