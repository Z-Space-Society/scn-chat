import { api, json, read } from '../../../shared/api.ts'

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * Save the user's preferences record, starting from the stored one so fields the caller doesn't
 * change are kept, with the browser's time zone.
 */
export function savePreferences(record: Record<string, unknown>) {
  const { $type: _type, updatedAt: _updated, ...fields } = record
  return read(api.chats.preferences.$put({}, json({ ...fields, timezone: browserTimeZone() })))
}
