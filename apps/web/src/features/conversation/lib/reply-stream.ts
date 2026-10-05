/** A reply's stream events, as the server sends them. See TurnsApi's stream route. */
export type ReplyEvent =
  | { type: 'part-start'; index: number; partType: string }
  | { type: 'delta'; index: number; text: string }
  | { type: 'status'; status: string }

/** Statuses after which the reply's record is final. Others mean another server runs the reply. */
export const FINISHED = new Set(['complete', 'error', 'cancelled'])

/**
 * A reply's events from its stream endpoint. It ends after the status event, and throws if the
 * connection drops first. The connection closes when it ends or the signal aborts.
 */
export async function* replyEvents(url: string, signal: AbortSignal): AsyncGenerator<ReplyEvent> {
  const source = new EventSource(url)
  const queue: ReplyEvent[] = []
  let dropped = false
  let wake = () => {}
  const push = (event: ReplyEvent) => {
    queue.push(event)
    wake()
  }
  for (const type of ['part-start', 'delta', 'status'] as const)
    source.addEventListener(type, (event) =>
      push({ type, ...JSON.parse((event as MessageEvent).data) } as ReplyEvent),
    )
  source.onerror = () => {
    dropped = true
    wake()
  }
  signal.addEventListener('abort', () => wake())
  try {
    while (!signal.aborted) {
      const event = queue.shift()
      if (event) {
        yield event
        if (event.type === 'status') return
      } else if (dropped) {
        throw new Error('The reply stream dropped')
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    }
  } finally {
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
