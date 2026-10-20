import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNow } from '../shared/useNow.ts'

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

/** How many steps each map keeps, so a long session's times stay bounded. */
export const KEPT_STEPS = 500

/** Keep a step's time, forgetting the oldest kept once there are more than `KEPT_STEPS`. */
function keep(times: Map<string, number>, id: string, ms: number) {
  times.set(id, ms)
  if (times.size > KEPT_STEPS) times.delete(times.keys().next().value as string)
}
// Told each time a duration is recorded, so summaries of finished steps update.
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * A value read from the recorded durations, such as a block's summary, which rerenders only when
 * a newly recorded duration changes it, rather than whenever any step stops.
 */
export function useStepDurations<T extends string | number | undefined>(read: () => T): T {
  return useSyncExternalStore(subscribe, read, read)
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
  // Recording this step's duration rerenders it, and only it, through the signal summaries use.
  const duration = useStepDurations(() => (id ? stepDuration(id) : undefined))
  // Held here too, since rendering can't watch the map change.
  const [start, setStart] = useState<number>()
  useEffect(() => {
    if (!id || !running) return
    if (!started.has(id)) keep(started, id, Date.now())
    setStart(started.get(id))
  }, [id, running])
  const now = useNow(1000, { on: Boolean(id) && running, since: start })
  useEffect(() => {
    if (!id || running) return
    const start = started.get(id)
    if (start === undefined || durations.has(id)) return
    keep(durations, id, Date.now() - start)
    // The duration is all a finished step needs, so its start goes.
    started.delete(id)
    for (const listener of listeners) listener()
  }, [id, running])

  if (!id) return {}
  if (running) return { elapsed: start === undefined ? 0 : (now - start) / 1000 }
  return duration === undefined ? {} : { duration }
}

/** Forget every measured time, for tests. */
export function resetStepClocks() {
  started.clear()
  durations.clear()
}
