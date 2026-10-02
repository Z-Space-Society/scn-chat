import { useCallback, useState } from 'react'
import { ApiError } from '../api.ts'
import type { Issue } from '../lib/response.ts'

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Run UI actions and keep the last error message, and its field issues, for display. */
export function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const run = useCallback((action: () => Promise<unknown>) => {
    setError(null)
    setIssues([])
    action().catch((err: unknown) => {
      setError(messageOf(err))
      setIssues(err instanceof ApiError ? err.issues : [])
    })
  }, [])
  return { error, issues, run, fail: setError }
}
