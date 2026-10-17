import type { ComponentType } from 'react'
import type { MessageRecord } from '../shared/message.ts'
import type { ToolStatus } from './tool-status.ts'

/** A message part as stored, in its lexicon's JSON form. */
export interface Part {
  $type: string
  [field: string]: unknown
}

/** A blob in a part, in its JSON form. */
export interface BlobRef {
  ref: { $link: string }
  mimeType: string
  size?: number
}

/** The URL of a blob in the conversation, by its CID. */
export type BlobUrl = (cid: string, mimeType?: string) => string

export interface PartViewProps {
  part: Part
  /** The message record the part belongs to. */
  record: MessageRecord
  blobUrl: BlobUrl
  /** Whether the part is still being written, as the newest part of a reply that streams. */
  live?: boolean
}

export type PartView = ComponentType<PartViewProps>

/** A part's kind, the fragment of its `$type`, like `textPart`. */
export const kind = (part: Part) => part.$type.split('#')[1]

export interface ToolViewProps {
  call: Part
  /** The call's result, or undefined while it runs or when it never came. */
  result: Part | undefined
  status: ToolStatus
  /** The message record the call belongs to. */
  record: MessageRecord
  blobUrl: BlobUrl
}

/** How one tool's steps read: what they did, what they are doing, and what they show once open. */
export interface ToolEntry {
  /** What the step did, on its row and in the finished summary: "Searched the web". */
  label: string
  /** What it is doing while it runs, on the live line: "Searching the web". */
  activity: string
  /** Whether the label is the tool's own name, shown as code. */
  code?: boolean
  /** The few words of the call's input, as its JSON text, that its row shows. */
  glimpse(input: string): string
  /** The step's body once opened. */
  View: ComponentType<ToolViewProps>
}
