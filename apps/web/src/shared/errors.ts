import { ApiError } from './api.ts'
import type { Issue } from './response.ts'

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The error from whichever of these mutations ran last, so a later success clears an earlier failure. */
export function lastError(...mutations: { error: unknown; submittedAt: number }[]): string | null {
  const last = mutations.reduce((a, b) => (b.submittedAt > a.submittedAt ? b : a))
  return last.error ? messageOf(last.error) : null
}

/** The problems the server found with a failed save's fields, to show beside each field. */
export const issuesOf = (err: unknown): Issue[] => (err instanceof ApiError ? err.issues : [])
