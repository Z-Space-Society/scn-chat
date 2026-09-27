import { TID } from '@atproto/common-web'
import { cidForLex } from '@atproto/lex-cbor'
import type { LexValue } from '@atproto/lex-data'
import { jsonToLex, lexToJson } from '@atproto/lex-json'

/** A record in its atproto JSON form, the only form records take inside the server. */
export type JsonRecord = Record<string, unknown>

export const newTid = (): string => TID.nextStr()

export const toLex = (value: JsonRecord): LexValue =>
  jsonToLex(value as Parameters<typeof jsonToLex>[0])
export const toJson = (value: unknown): JsonRecord => lexToJson(value as LexValue) as JsonRecord

/** The record's CID, computed the way a PDS computes it. */
export async function recordCid(value: JsonRecord): Promise<string> {
  return (await cidForLex(toLex(value))).toString()
}

export function spaceUri(did: string, type: string, skey: string): string {
  return `at://${did}/space/${type}/${skey}`
}

export class InvalidSpaceUri extends Error {
  constructor(uri: string) {
    super(`Not a space URI: ${uri}`)
    this.name = 'InvalidSpaceUri'
  }
}

export function parseSpaceUri(uri: string): { did: string; type: string; skey: string } {
  const match = uri.match(/^at:\/\/(did:[^/]+)\/space\/([^/]+)\/([^/]+)$/)
  if (!match?.[1] || !match[2] || !match[3]) throw new InvalidSpaceUri(uri)
  return { did: match[1], type: match[2], skey: match[3] }
}
