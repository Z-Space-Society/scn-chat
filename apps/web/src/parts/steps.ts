import { kind, type Part } from './types.ts'

/** One thing the model did on the way to its answer. */
export type Step =
  | { kind: 'reasoning'; key: string; text: string }
  | { kind: 'tool'; key: string; call: Part; result?: Part }

/**
 * A message's parts as they read: content in order, with each run of reasoning and tool use
 * gathered into one block of steps, and sources apart at the end.
 */
export type Block =
  | { kind: 'content'; key: string; part: Part }
  | { kind: 'steps'; key: string; steps: Step[] }

const isWork = (part: Part) => {
  const k = kind(part)
  return k === 'reasoningPart' || k === 'toolCallPart' || k === 'toolResultPart'
}

/** What tells a part apart within its message, since only tool parts carry an id. */
function partIdentity(part: Part): string {
  const blob = (part.image ?? part.file) as { ref: { $link: string } } | undefined
  return `${part.$type}:${(part.callId ?? blob?.ref.$link ?? '') as string}`
}

/** Group a message's parts into blocks, and pull out its sources. */
export function groupParts(all: Part[]): { blocks: Block[]; sources: Part[] } {
  // A streamed reply can have holes where a part has not started yet.
  const parts = all.filter(Boolean)
  const sources = parts.filter((part) => kind(part) === 'sourcePart')
  const blocks: Block[] = []
  const seen = new Map<string, number>()
  const keyFor = (part: Part, index: number) => {
    const identity = kind(part) === 'textPart' ? `${part.$type}:${index}` : partIdentity(part)
    const count = seen.get(identity) ?? 0
    seen.set(identity, count + 1)
    return `${identity}#${count}`
  }
  const calls = new Map<string, Extract<Step, { kind: 'tool' }>>()

  parts.forEach((part, index) => {
    if (kind(part) === 'sourcePart') return
    if (!isWork(part)) {
      blocks.push({ kind: 'content', key: keyFor(part, index), part })
      return
    }
    let last = blocks.at(-1)
    if (last?.kind !== 'steps') {
      last = { kind: 'steps', key: `steps:${index}`, steps: [] }
      blocks.push(last)
    }
    switch (kind(part)) {
      case 'reasoningPart':
        last.steps.push({
          kind: 'reasoning',
          key: keyFor(part, index),
          text: (part.text as string) ?? '',
        })
        break
      case 'toolCallPart': {
        const step = { kind: 'tool' as const, key: keyFor(part, index), call: part }
        calls.set(part.callId as string, step)
        last.steps.push(step)
        break
      }
      case 'toolResultPart': {
        const call = calls.get(part.callId as string)
        if (call) call.result = part
        // A result without its call, as when a provider runs the tool, still shows.
        else
          last.steps.push({
            kind: 'tool',
            key: keyFor(part, index),
            call: { $type: part.$type, callId: part.callId, tool: 'tool', input: '' },
            result: part,
          })
        break
      }
    }
  })
  return { blocks, sources }
}

/** Every step a message took, across all its blocks, in order. */
export const stepsOf = (parts: Part[]): Step[] =>
  groupParts(parts).blocks.flatMap((block) => (block.kind === 'steps' ? block.steps : []))

/** JSON text pretty-printed, or the text as it is when it isn't JSON. */
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Text cut to at most `max` characters, ending in an ellipsis when cut. */
export const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/** A one-line glimpse of a tool's input, such as the query it searched for. */
export function inputGlimpse(input: string): string {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    return clip(input.replace(/\s+/g, ' '), 80)
  }
  if (typeof value === 'string') return clip(`"${value}"`, 80)
  if (value && typeof value === 'object') {
    const first = Object.values(value).find((v) => typeof v === 'string')
    if (typeof first === 'string') return clip(`"${first.replace(/\s+/g, ' ')}"`, 80)
  }
  return ''
}

/** How long the model thought, rounded to at least a second, as "Thought for 12s". */
export const thoughtFor = (seconds: number, format: (s: number) => string) =>
  `Thought for ${format(Math.max(1, Math.round(seconds)))}`

/**
 * A summary of a block of steps, such as "Thought · Searched the web ×2 · lookup", naming each tool
 * step by its tool's label. When every reasoning step's duration is known, the thinking reads as its
 * total, as "Thought for 12s".
 */
export function stepsSummary(
  steps: Step[],
  durationOf: (step: Step) => number | undefined = () => undefined,
  format: (seconds: number) => string = (s) => `${s}s`,
  labelOf: (tool: string) => string = (tool) => tool,
): string {
  const reasoning = steps.filter((step) => step.kind === 'reasoning')
  const times = reasoning.map(durationOf)
  const thought = times.every((t) => t !== undefined)
    ? thoughtFor(
        times.reduce<number>((total, t) => total + (t ?? 0), 0),
        format,
      )
    : null
  const labels: { label: string; count: number }[] = []
  for (const step of steps) {
    const label = step.kind === 'reasoning' ? 'Thought' : labelOf(step.call.tool as string)
    const previous = labels.find((l) => l.label === label)
    if (previous) previous.count++
    else labels.push({ label, count: 1 })
  }
  return labels
    .map((l) => {
      if (l.label === 'Thought' && thought) return thought
      return l.count > 1 ? `${l.label} ×${l.count}` : l.label
    })
    .join(' · ')
}
