import type { BranchMessage, Capabilities, ModelProvider, ModelRef } from '@scn-chat/plugin-api'
import type { JSONValue, ModelMessage } from 'ai'
import type { Logger } from '../logger.ts'
import type { JsonRecord } from '../storage/records.ts'

type Part = Record<string, unknown> & { $type: string }
type BlobRef = { ref: { $link: string }; mimeType: string }

export class TurnInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TurnInputError'
  }
}

/** Reads a blob referenced from the conversation, for attachments. */
export type BlobReader = (cid: string) => Promise<{ bytes: Uint8Array; mimeType: string }>

const kind = (part: Part) => part.$type.split('#')[1]
const partsOf = (record: JsonRecord): Part[] => {
  const content = record.content as { $type: string; parts?: Part[] }
  if (!content.$type.endsWith('#plainContent'))
    throw new TurnInputError(
      'This conversation has encrypted messages, which SCN Chat cannot read yet.',
    )
  return content.parts as Part[]
}

/** Follow parent keys from the given message back to the root, returning the chain in order. */
export function branchTo(messages: Map<string, BranchMessage>, rkey: string): BranchMessage[] {
  const chain: BranchMessage[] = []
  const seen = new Set<string>()
  let current: string | undefined = rkey
  while (current && !seen.has(current)) {
    seen.add(current)
    const message = messages.get(current)
    if (!message) break
    chain.unshift(message)
    current = message.record.parent
  }
  return chain
}

/** Get the model of the nearest completed reply on the branch. */
export function lastReplyModel(branch: BranchMessage[]): ModelRef | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const record = branch[i]?.record as unknown as JsonRecord | undefined
    if (record?.role === 'assistant' && record.status === 'complete' && record.model)
      return record.model as ModelRef
  }
  return undefined
}

/** Fill the admin's base prompt placeholders for the user's time zone. Unknown placeholders are kept. */
export function fillBasePrompt(
  template: string,
  options: { appName: string; timeZone: string; now: Date },
): string {
  const { appName, timeZone, now } = options
  const values: Record<string, string> = {
    appName,
    timezone: timeZone,
    date: new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full' }).format(now),
    time: new Intl.DateTimeFormat('en-US', { timeZone, timeStyle: 'short' }).format(now),
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match)
}

/** The user's time zone from their preferences, or UTC when it is missing or not a real zone. */
export function timeZoneOf(preferences: JsonRecord | null, logger: Logger): string {
  const zone = preferences?.timezone
  if (typeof zone !== 'string') return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch (err) {
    if (!(err instanceof RangeError)) throw err
    logger.warn({ zone }, 'unknown time zone in preferences, using UTC')
    return 'UTC'
  }
}

export function buildInstructions(
  base: string,
  preferences: JsonRecord | null,
  info: JsonRecord | null,
): string {
  return [base, preferences?.customInstructions, info?.systemPrompt]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join('\n\n')
}

type ProviderOptions = Record<string, Record<string, JSONValue>>

const parseProviderData = (value: unknown): ProviderOptions | undefined =>
  value === undefined ? undefined : (JSON.parse(value as string) as ProviderOptions)

async function userContent(parts: Part[], capabilities: Capabilities, readBlob: BlobReader) {
  const content: Exclude<Extract<ModelMessage, { role: 'user' }>['content'], string> = []
  for (const part of parts) {
    const type = kind(part)
    if (type === 'textPart') content.push({ type: 'text', text: part.text as string })
    else if (type === 'imagePart') {
      if (!capabilities.vision)
        throw new TurnInputError('This model cannot read images. Choose a model with vision.')
      const image = part.image as BlobRef
      const blob = await readBlob(image.ref.$link)
      content.push({ type: 'file', data: blob.bytes, mediaType: image.mimeType })
    } else if (type === 'filePart') {
      const name = (part.name as string | undefined) ?? 'Attached file'
      const extracted = part.extracted as { text: BlobRef } | undefined
      if (!extracted) {
        content.push({
          type: 'text',
          text: `A file named "${name}" was attached, but it could not be read.`,
        })
        continue
      }
      const text = new TextDecoder().decode((await readBlob(extracted.text.ref.$link)).bytes)
      content.push({ type: 'text', text: `# ${name}\n\n${text}` })
    }
  }
  return content
}

/** Convert assistant parts to AI SDK messages, splitting at tool results. */
function assistantMessages(parts: Part[], replay: boolean): ModelMessage[] {
  const messages: ModelMessage[] = []
  let assistant: Exclude<Extract<ModelMessage, { role: 'assistant' }>['content'], string> = []
  let tool: Extract<ModelMessage, { role: 'tool' }>['content'] = []
  const toolNames = new Map<string, string>()
  const flushAssistant = () => {
    if (assistant.length) messages.push({ role: 'assistant', content: assistant })
    assistant = []
  }
  const flushTool = () => {
    if (tool.length) messages.push({ role: 'tool', content: tool })
    tool = []
  }
  const answered = new Set(
    parts.filter((part) => kind(part) === 'toolResultPart').map((part) => part.callId as string),
  )
  for (const part of parts) {
    const type = kind(part)
    // A reply cancelled mid-tool-call has a call with no result, which providers reject.
    if (type === 'toolCallPart' && !answered.has(part.callId as string)) continue
    const providerOptions = replay ? parseProviderData(part.providerData) : undefined
    if (type === 'toolResultPart') {
      flushAssistant()
      const callId = part.callId as string
      const toolName = toolNames.get(callId)
      if (!toolName) throw new Error(`Tool result ${callId} has no tool call before it`)
      const output = part.output as string
      tool.push({
        type: 'tool-result',
        toolCallId: callId,
        toolName,
        output: part.isError
          ? { type: 'error-text', value: output }
          : { type: 'text', value: output },
      })
      continue
    }
    flushTool()
    if (type === 'textPart')
      assistant.push({
        type: 'text',
        text: part.text as string,
        ...(providerOptions ? { providerOptions } : {}),
      })
    else if (type === 'reasoningPart' && replay) {
      assistant.push({
        type: 'reasoning',
        text: (part.text as string | undefined) ?? '',
        ...(providerOptions ? { providerOptions } : {}),
      })
    } else if (type === 'toolCallPart') {
      toolNames.set(part.callId as string, part.tool as string)
      assistant.push({
        type: 'tool-call',
        toolCallId: part.callId as string,
        toolName: part.tool as string,
        input: JSON.parse(part.input as string),
        ...(providerOptions ? { providerOptions } : {}),
      })
    }
  }
  flushAssistant()
  flushTool()
  return messages
}

/** Convert the branch to AI SDK messages, leaving out errored and pending replies. */
export async function toModelMessages(
  branch: BranchMessage[],
  options: { provider: ModelProvider; capabilities: Capabilities; readBlob: BlobReader },
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []
  for (const { record } of branch) {
    const json = record as unknown as JsonRecord
    const parts = partsOf(json)
    if (json.role === 'user') {
      const content = await userContent(parts, options.capabilities, options.readBlob)
      if (content.length) messages.push({ role: 'user', content })
    } else if (
      json.role === 'assistant' &&
      (json.status === 'complete' || json.status === 'cancelled')
    ) {
      const sameProvider = (json.model as ModelRef | undefined)?.provider === options.provider.id
      messages.push(
        ...assistantMessages(parts, sameProvider && options.provider.replay === 'replay'),
      )
    }
  }
  return messages
}
