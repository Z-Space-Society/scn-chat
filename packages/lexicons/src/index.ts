import { jsonToLex } from '@atproto/lex-json'
import * as atproto from './generated/com/atproto.ts'
import * as chat from './generated/network/sharedcomputer/chat.ts'
import { nsid } from './nsid.ts'

/** Our lexicons, and the vendored com.atproto lexicons the server calls. */
export { atproto, chat, nsid }

export type InfoRecord = chat.info.Main
export type MessageRecord = chat.message.Main
export type ConversationRefRecord = chat.conversationRef.Main
export type PreferencesRecord = chat.preferences.Main
export type ModelRef = chat.defs.ModelRef
export type Effort = chat.defs.Effort
export type GenerationRequest = chat.defs.GenerationRequest
export type PlainContent = chat.defs.PlainContent
export type EncryptedContent = chat.defs.EncryptedContent
export type TextPart = chat.defs.TextPart
export type ReasoningPart = chat.defs.ReasoningPart
export type ImagePart = chat.defs.ImagePart
export type FilePart = chat.defs.FilePart
export type ToolCallPart = chat.defs.ToolCallPart
export type ToolResultPart = chat.defs.ToolResultPart
export type SourcePart = chat.defs.SourcePart
export type Usage = chat.defs.Usage

const recordSchemas = {
  [nsid.info]: chat.info.main,
  [nsid.message]: chat.message.main,
  [nsid.conversationRef]: chat.conversationRef.main,
  [nsid.preferences]: chat.preferences.main,
} as const

export type RecordNsid = keyof typeof recordSchemas

export type ValidationResult = { success: true } | { success: false; error: string }

/** Check a record, in its JSON form, against its lexicon before it is written anywhere. */
export function validateRecord(collection: RecordNsid, value: unknown): ValidationResult {
  const result = recordSchemas[collection].safeParse(
    jsonToLex(value as Parameters<typeof jsonToLex>[0]),
  )
  return result.success ? { success: true } : { success: false, error: String(result.reason) }
}

export function isRecordNsid(collection: string): collection is RecordNsid {
  return collection in recordSchemas
}
