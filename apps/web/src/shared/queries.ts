/** Server data, keyed by the route it comes from, in each feature's queries.ts. Writes invalidate the keys they change. */

/**
 * How long settings-like data stays fresh. Without it, each component refetches when it mounts:
 * right after a loader or the server render fetched the same data, and in every conversation opened.
 */
export const staleTime = 60_000
