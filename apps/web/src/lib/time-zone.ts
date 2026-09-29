import { api, json, read } from '../api.ts'

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Save the browser's time zone to the user's preferences when it differs from the stored one. */
export async function syncTimeZone(): Promise<void> {
  const { preferences } = await read(api.chats.preferences.$get())
  const stored = (preferences ?? {}) as Record<string, unknown>
  const timezone = browserTimeZone()
  if (stored.timezone === timezone) return
  const { $type: _type, updatedAt: _updated, ...record } = stored
  await read(api.chats.preferences.$put({}, json({ ...record, timezone })))
}
