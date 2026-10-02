import type { QueryClient } from '@tanstack/react-query'
import { api, json, read } from '../api.ts'
import { preferencesQuery } from '../queries.ts'

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** Save the browser's time zone to the user's preferences when it differs from the stored one. */
export async function syncTimeZone(queryClient: QueryClient): Promise<void> {
  const stored = (await queryClient.fetchQuery(preferencesQuery)) ?? {}
  const timezone = browserTimeZone()
  if (stored.timezone === timezone) return
  const { $type: _type, updatedAt: _updated, ...record } = stored
  await read(api.chats.preferences.$put({}, json({ ...record, timezone })))
  await queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey })
}
