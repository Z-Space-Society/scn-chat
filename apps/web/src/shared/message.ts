import type { MessageRecord } from '@scn-chat/lexicons'
import { nsid } from '@scn-chat/lexicons/nsid'
import type { Part } from '../parts/types.ts'

export type { MessageRecord }

/**
 * The statuses after which a reply's record changes no more. Another client may write a status
 * this app doesn't know, which is neither pending nor finished.
 */
const FINISHED = new Set<string>(['complete', 'error', 'cancelled'])

/** Whether a reply is still being written. */
export const isPending = (record: MessageRecord) => record.status === 'pending'

/** Whether a reply's status, from its record or its stream, is final. */
export const isFinished = (status: string | null | undefined) =>
  status !== null && status !== undefined && FINISHED.has(status)

/** Whether the message's content is encrypted, so the app can't show it. */
export const isEncrypted = (record: MessageRecord) =>
  record.content.$type === `${nsid.defs}#encryptedContent`

/** A message's parts. Encrypted content, and content of a kind this app doesn't know, have none. */
export const partsOf = (record: MessageRecord): Part[] =>
  (record.content as { parts?: Part[] }).parts ?? []

/** Who wrote a message: the user, or the model that wrote the reply. */
export const authorOf = (record: MessageRecord): string =>
  record.role === 'user' ? 'You' : (record.model?.id ?? 'Assistant')
