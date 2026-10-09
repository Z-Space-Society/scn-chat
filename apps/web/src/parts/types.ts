import type { ComponentType } from 'react'

/** A message part as stored, in its lexicon's JSON form. */
export interface Part {
  $type: string
  [field: string]: unknown
}

/** A blob in a part, in its JSON form. */
export interface BlobRef {
  ref: { $link: string }
  mimeType: string
}

/** The URL of a blob in the conversation, by its CID. */
export type BlobUrl = (cid: string, mimeType?: string) => string

export interface PartViewProps {
  part: Part
  /** The message record the part belongs to. */
  record: Record<string, unknown>
  blobUrl: BlobUrl
}

export type PartView = ComponentType<PartViewProps>

/** A part's kind, the fragment of its `$type`, like `textPart`. */
export const kind = (part: Part) => part.$type.split('#')[1]
