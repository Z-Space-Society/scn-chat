import { useEffect, useState } from 'react'

interface Options {
  /** Whether it ticks, so a clock with nothing to time can rest. It ticks by default. */
  on?: boolean
  /**
   * The time it counts from, in milliseconds, so it ticks just after each whole step since then and
   * a count of seconds since it shows each second as it passes.
   */
  since?: number
}

/** The current time in milliseconds, ticking every `every` milliseconds. */
export function useNow(every: number, options: Options = {}): number {
  const on = options.on ?? true
  const since = options.since
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    const from = since ?? Date.now()
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      setNow(Date.now())
      timer = setTimeout(tick, every - ((Date.now() - from) % every) + 10)
    }
    tick()
    return () => clearTimeout(timer)
  }, [every, on, since])
  return now
}
