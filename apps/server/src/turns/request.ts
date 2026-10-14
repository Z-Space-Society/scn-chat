import { nsid } from '@scn-chat/lexicons'
import type { ModelRef } from '@scn-chat/plugin-api'
import type { JsonRecord } from '../storage/records.ts'

/*
 * The convention by which a user message asks for a reply, as lexicons/README.md describes it,
 * for every client: a user message with a `generation` object asks for a reply, keyed by the
 * message's key and the attempt, and raising the attempt asks again.
 */

/** What a user message asks of its reply. */
export type Generation = {
  model?: ModelRef
  effort?: string
  tools?: string[]
  /** Which reply this asks for, starting at 0. */
  attempt: number
}

/** The key of the reply to a user message's attempt, as `3abc.r0`. */
export const replyKey = (userRkey: string, attempt: number) => `${userRkey}.r${attempt}`

/**
 * What a record asks of its reply, or null when it asks for none: it isn't a user message, has no
 * generation object, or its attempt isn't a whole number. Lenient enough for a record that failed
 * validation, so the app can still answer it with an error.
 */
export function generationOf(record: JsonRecord): Generation | null {
  const generation = record.generation
  if (record.role !== 'user' || !generation || typeof generation !== 'object') return null
  const fields = generation as Omit<Generation, 'attempt'> & { attempt?: unknown }
  const attempt = Number(fields.attempt ?? 0)
  if (!Number.isInteger(attempt)) return null
  return { ...fields, attempt }
}

/** A new user message holding parts, asking for its first reply when it has a generation. */
export function userMessage(input: {
  parts: JsonRecord[]
  parent?: string
  generation?: Omit<Generation, 'attempt'>
  createdAt: string
}): JsonRecord {
  const record: JsonRecord = {
    $type: nsid.message,
    role: 'user',
    content: { $type: `${nsid.defs}#plainContent`, parts: input.parts },
    createdAt: input.createdAt,
  }
  if (input.parent) record.parent = input.parent
  if (input.generation) record.generation = { ...input.generation, attempt: 0 }
  return record
}

/** A user message asking for one more reply, with the next attempt and any new model or effort. */
export function askAgain(
  record: JsonRecord,
  overrides: { model?: ModelRef; effort?: string },
): JsonRecord {
  const previous = (record.generation ?? {}) as JsonRecord & { attempt?: number }
  const generation: JsonRecord = { ...previous, attempt: (previous.attempt ?? 0) + 1 }
  if (overrides.model) generation.model = overrides.model
  if (overrides.effort) generation.effort = overrides.effort
  return { ...record, generation }
}
