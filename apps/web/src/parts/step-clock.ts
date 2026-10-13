import { useEffect, useState, useSyncExternalStore } from 'react'

/** Seconds as "4s" or "1m 05s". */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * When each step of a reply was first seen running, and how long it ran, by reply and step. The
 * record keeps no times, so these are measured live, and kept in memory so they survive the
 * stream giving way to the finished record. A reply not watched while it streamed has none.
 */
const started = new Map<string, number>()
const durations = new Map<string, number>()
// Bumped each time a duration is recorded, so summaries of finished steps update.
let version = 0
const listeners = new Set<() => void>()

/** Rerender when a step's duration is recorded, as a block's summary needs. */
export function useStepDurations(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
    () => 0,
  )
}

/** How long a step ran, in seconds, if it was watched while it ran. */
export const stepDuration = (id: string): number | undefined => {
  const ms = durations.get(id)
  return ms === undefined ? undefined : ms / 1000
}

/**
 * A step's clock: while it runs, the seconds since it was first seen, ticking each second; once it
 * stops, how long it ran. Neither is known for a step only ever seen finished, or without an id.
 */
export function useStepClock(
  id: string | undefined,
  running: boolean,
): { elapsed?: number; duration?: number } {
  const [now, setNow] = useState(() => Date.now())
  // Recording this step's duration rerenders it through the same signal summaries listen to.
  useStepDurations()
  useEffect(() => {
    if (!id || !running) return
    if (!started.has(id)) started.set(id, Date.now())
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [id, running])
  useEffect(() => {
    if (!id || running) return
    const start = started.get(id)
    if (start === undefined || durations.has(id)) return
    durations.set(id, Date.now() - start)
    version++
    for (const listener of listeners) listener()
  }, [id, running])

  if (!id) return {}
  const start = started.get(id)
  if (running) return { elapsed: start === undefined ? 0 : (now - start) / 1000 }
  const duration = stepDuration(id)
  return duration === undefined ? {} : { duration }
}

/** Forget every measured time, for tests. */
export function resetStepClocks() {
  started.clear()
  durations.clear()
  version = 0
}
