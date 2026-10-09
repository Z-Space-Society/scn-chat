import type { QueryClient } from '@tanstack/react-query'
import { preferencesQuery } from '../queries.ts'
import { browserTimeZone, savePreferences } from './preferences.ts'

/** Save the browser's time zone to the user's preferences when it differs from the stored one. */
export async function syncTimeZone(queryClient: QueryClient): Promise<void> {
  const stored = (await queryClient.query(preferencesQuery)) ?? {}
  if (stored.timezone === browserTimeZone()) return
  await savePreferences(stored)
  await queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey })
}
