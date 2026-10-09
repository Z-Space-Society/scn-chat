import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { syncTimeZone } from '../lib/time-zone.ts'

/** Save the browser's time zone to the user's preferences once the signed-in app opens. */
export function useSyncTimeZone() {
  const queryClient = useQueryClient()
  useEffect(() => {
    syncTimeZone(queryClient).catch((err: unknown) =>
      console.warn('Could not save the time zone', err),
    )
  }, [queryClient])
}
