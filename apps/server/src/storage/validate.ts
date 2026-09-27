import { isRecordNsid, validateRecord } from '@scn-chat/lexicons'
import type { Logger } from '../logger.ts'
import { InvalidRecord, InvalidStoredRecord } from './record-store.ts'
import type { JsonRecord } from './records.ts'

/** Refuse to write one of our records unless it matches its lexicon. */
export function assertValidRecord(collection: string, value: JsonRecord): void {
  if (!isRecordNsid(collection)) return
  const result = validateRecord(collection, value)
  if (!result.success) throw new InvalidRecord(collection, result.error)
}

/** Check a record read from the PDS against its lexicon. */
export function assertValidStored(
  space: string,
  collection: string,
  rkey: string,
  value: JsonRecord,
): void {
  if (!isRecordNsid(collection)) throw new Error(`No lexicon to check ${collection} against`)
  const result = validateRecord(collection, value)
  if (!result.success) throw new InvalidStoredRecord(space, collection, rkey, result.error)
}

/** Drop and log any records that don't match their lexicon. */
export function keepValid<T extends { rkey: string; value: JsonRecord }>(
  space: string,
  collection: string,
  records: T[],
  logger: Logger,
): T[] {
  return records.filter((record) => {
    try {
      assertValidStored(space, collection, record.rkey, record.value)
      return true
    } catch (err) {
      if (!(err instanceof InvalidStoredRecord)) throw err
      logger.warn(
        { err, space, rkey: record.rkey },
        'skipping a record that does not match its lexicon',
      )
      return false
    }
  })
}
