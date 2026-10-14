import { useSyncExternalStore } from 'react'

/**
 * The newest reply the user has seen in each chat, by chat key, kept in this browser. A chat whose
 * newest finished reply differs from the one seen shows as new. It is a convenience for one
 * device, so a reply read elsewhere still shows as new here once.
 */
export type Seen = Record<string, string>

const listeners = new Set<() => void>()
const cache = new Map<string, Seen | null>()

const keyFor = (did: string) => `scn-chat:seen:${did}`

/** Whether a stored value has the shape kept here, so anything else starts over. */
const isSeen = (value: unknown): value is Seen =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((reply) => typeof reply === 'string')

function load(did: string): Seen | null {
  if (cache.has(did)) return cache.get(did) ?? null
  let seen: Seen | null = null
  try {
    const raw = localStorage.getItem(keyFor(did))
    const stored: unknown = raw ? JSON.parse(raw) : null
    if (isSeen(stored)) seen = stored
  } catch {
    // Unreadable or blocked storage starts over, as on a new device, as does a value of another
    // shape.
  }
  cache.set(did, seen)
  return seen
}

function save(did: string, seen: Seen) {
  cache.set(did, seen)
  try {
    localStorage.setItem(keyFor(did), JSON.stringify(seen))
  } catch {
    // Without storage the marks last until the page reloads.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * The seen replies for an account, or null before anything was recorded on this device. Then the
 * first list seeds it, so chats from before aren't all marked new.
 */
export function useSeen(did: string): Seen | null {
  return useSyncExternalStore(
    subscribe,
    () => load(did),
    () => null,
  )
}

/** Record replies as seen, keeping only the chats that still exist. */
export function markSeen(did: string, replies: Seen, existing?: string[]) {
  const before = load(did) ?? {}
  const next: Seen = { ...before, ...replies }
  if (existing) {
    const keep = new Set(existing)
    for (const skey of Object.keys(next)) if (!keep.has(skey)) delete next[skey]
  }
  const changed =
    Object.keys(next).length !== Object.keys(before).length ||
    Object.entries(next).some(([skey, rkey]) => before[skey] !== rkey) ||
    load(did) === null
  if (changed) save(did, next)
}

/** Forget what was cached, for tests. */
export function resetSeenCache() {
  cache.clear()
}
