import { useCallback, useState } from 'react'

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Run UI actions and keep the last error message for display. */
export function useAction() {
  const [error, setError] = useState<string | null>(null)
  const run = useCallback((action: () => Promise<unknown>) => {
    setError(null)
    action().catch((err: unknown) => setError(messageOf(err)))
  }, [])
  return { error, run }
}
