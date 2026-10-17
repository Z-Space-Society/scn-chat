import { nsid } from '@scn-chat/lexicons/nsid'
import type { MessageRecord } from '../../src/shared/message.ts'

/**
 * A message record for a test: a reply with no parts unless `fields` says otherwise, with the
 * fields every record has filled in. Its parts can be written as loosely as the part views read
 * them.
 */
export const messageRecord = (fields: Record<string, unknown> = {}): MessageRecord =>
  ({
    $type: nsid.message,
    role: 'assistant',
    content: { $type: `${nsid.defs}#plainContent`, parts: [] },
    createdAt: '2026-09-26T00:00:00Z',
    ...fields,
  }) as MessageRecord
