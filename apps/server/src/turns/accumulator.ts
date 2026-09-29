import { nsid } from '@scn-chat/lexicons'
import type { TextStreamPart, ToolSet } from 'ai'
import { safeErrorMessage } from '../safe-error.ts'

type Part = Record<string, unknown>

export type StreamEvent =
  | { type: 'part-start'; index: number; partType: string }
  | { type: 'delta'; index: number; text: string }
  | { type: 'part'; index: number; part: Part }

const defs = (name: string) => `${nsid.defs}#${name}`
export const encode = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value)
const providerData = (metadata: object | undefined) =>
  metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined

const segmenter = new Intl.Segmenter()

/** Cut a source title to the lexicon's 300 graphemes and 3000 bytes. */
function clipTitle(title: string): string {
  let clipped = ''
  let count = 0
  for (const { segment } of segmenter.segment(title)) {
    if (count === 300 || Buffer.byteLength(clipped + segment) > 3000) break
    clipped += segment
    count++
  }
  return clipped
}

/** The URL in canonical form, for spotting repeats, when it is http or https. */
function webUrlKey(url: string): string | undefined {
  if (!URL.canParse(url)) return undefined
  const parsed = new URL(url)
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined
}

/** Builds lexicon parts from an AI SDK stream, in the order the model produced them. */
export class PartAccumulator {
  readonly parts: Part[] = []
  usage: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } = {}
  private readonly open = new Map<string, number>()
  private readonly metadata = new Map<string, Record<string, Record<string, unknown>>>()
  private readonly cited = new Set<string>()
  private readonly emit: (event: StreamEvent) => void

  constructor(emit: (event: StreamEvent) => void = () => {}) {
    this.emit = emit
  }

  /** Merge provider metadata for a part, which some providers send on its start or deltas. */
  private remember(key: string, metadata: Record<string, Record<string, unknown>> | undefined) {
    if (!metadata) return
    const merged = this.metadata.get(key) ?? {}
    for (const [provider, values] of Object.entries(metadata))
      merged[provider] = { ...merged[provider], ...values }
    this.metadata.set(key, merged)
  }

  private start(key: string, type: string, part: Part): number {
    const index = this.parts.push(part) - 1
    this.open.set(key, index)
    this.emit({ type: 'part-start', index, partType: type })
    return index
  }

  private add(part: Part): void {
    const index = this.parts.push(part) - 1
    this.emit({ type: 'part', index, part })
  }

  /** Add a source link, unless it is not a web URL or the reply already cites it. */
  cite(source: { url: string; title?: string }): void {
    const key = webUrlKey(source.url)
    if (!key || this.cited.has(key)) return
    this.cited.add(key)
    const title = source.title && clipTitle(source.title)
    this.add({ $type: defs('sourcePart'), url: source.url, ...(title ? { title } : {}) })
  }

  /** Feed one stream part, returning an error when the part ends the turn. */
  push(chunk: TextStreamPart<ToolSet>): Error | undefined {
    switch (chunk.type) {
      case 'text-start':
        this.start(`text:${chunk.id}`, 'textPart', { $type: defs('textPart'), text: '' })
        this.remember(`text:${chunk.id}`, chunk.providerMetadata)
        break
      case 'reasoning-start':
        this.start(`reasoning:${chunk.id}`, 'reasoningPart', {
          $type: defs('reasoningPart'),
          text: '',
        })
        this.remember(`reasoning:${chunk.id}`, chunk.providerMetadata)
        break
      case 'text-delta':
      case 'reasoning-delta': {
        const kind = chunk.type === 'text-delta' ? 'text' : 'reasoning'
        const key = `${kind}:${chunk.id}`
        const index =
          this.open.get(key) ??
          this.start(key, `${kind}Part`, { $type: defs(`${kind}Part`), text: '' })
        this.remember(key, chunk.providerMetadata)
        const part = this.parts[index] as Part
        part.text = `${part.text as string}${chunk.text}`
        this.emit({ type: 'delta', index, text: chunk.text })
        break
      }
      case 'text-end':
      case 'reasoning-end': {
        const key = `${chunk.type === 'text-end' ? 'text' : 'reasoning'}:${chunk.id}`
        const index = this.open.get(key)
        this.remember(key, chunk.providerMetadata)
        const data = providerData(this.metadata.get(key))
        if (index !== undefined && data) (this.parts[index] as Part).providerData = data
        this.open.delete(key)
        this.metadata.delete(key)
        break
      }
      case 'tool-call': {
        const data = providerData(chunk.providerMetadata)
        this.add({
          $type: defs('toolCallPart'),
          callId: chunk.toolCallId,
          tool: chunk.toolName,
          // Encode unparsable input too, which arrives as the raw string.
          input: JSON.stringify(chunk.input),
          ...(data ? { providerData: data } : {}),
        })
        break
      }
      case 'tool-result':
        this.add({
          $type: defs('toolResultPart'),
          callId: chunk.toolCallId,
          output: encode(chunk.output),
        })
        break
      case 'tool-error':
        this.add({
          $type: defs('toolResultPart'),
          callId: chunk.toolCallId,
          output: safeErrorMessage(chunk.error),
          isError: true,
        })
        break
      case 'source':
        // Only URL sources are in the lexicon.
        if (chunk.sourceType === 'url') this.cite({ url: chunk.url, title: chunk.title })
        break
      case 'finish':
        this.usage = {
          inputTokens: chunk.totalUsage.inputTokens,
          outputTokens: chunk.totalUsage.outputTokens,
          reasoningTokens: chunk.totalUsage.outputTokenDetails.reasoningTokens,
        }
        break
      case 'error':
        return chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error))
      case 'file':
      case 'reasoning-file':
        return new Error('The model returned a file, which SCN Chat cannot store yet')
      case 'tool-output-denied':
      case 'tool-approval-request':
      case 'tool-approval-response':
        return new Error(`Unexpected ${chunk.type} part: SCN Chat does not use tool approvals`)
    }
    return undefined
  }

  /** Get the usage fields that are whole, non-negative numbers. */
  lexiconUsage(): Record<string, number> | undefined {
    const entries = Object.entries(this.usage).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 0,
    )
    return entries.length ? Object.fromEntries(entries) : undefined
  }
}
