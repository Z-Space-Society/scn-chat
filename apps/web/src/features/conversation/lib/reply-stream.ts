import type { HubEvent } from '@scn-chat/server/api-types'

/** The reply stream events the web app follows, as the server sends them. See TurnsApi's stream route. */
export type ReplyEvent = Extract<HubEvent, { type: 'part-start' | 'delta' | 'status' }>

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
      for (const type of ['part-start', 'delta', 'status'] as const)
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

/** A reply streamed so far: each part's type and text by index, and the final status once sent. */
export type ReplyParts = { kinds: string[]; texts: string[]; status: string | null }

export const noParts: ReplyParts = { kinds: [], texts: [], status: null }

export function addEvent(parts: ReplyParts, event: ReplyEvent): ReplyParts {
  if (event.type === 'status') return { ...parts, status: event.status }
  if (event.type === 'part-start') {
    const kinds = [...parts.kinds]
    kinds[event.index] = event.partType
    return { ...parts, kinds }
  }
  const texts = [...parts.texts]
  texts[event.index] = (texts[event.index] ?? '') + event.text
  return { ...parts, texts }
}

export type StreamedReply = { text: string; reasoning: string }

/** The streamed text to show, with reasoning parts apart from the rest. */
export function streamedReply({ kinds, texts }: ReplyParts): StreamedReply {
  const collect = (reasoning: boolean) =>
    texts.filter((text, i) => text && (kinds[i] === 'reasoningPart') === reasoning).join('\n\n')
  return { text: collect(false), reasoning: collect(true) }
}
