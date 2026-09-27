type State = {
  running: Promise<void> | null
  dirty: boolean
  lastRun: number
  timer: NodeJS.Timeout | null
}

/** Runs work per key one at a time, at most once per interval. */
export class Coalescer {
  private readonly states = new Map<string, State>()
  private readonly intervalMs: number

  constructor(intervalMs = 2_000) {
    this.intervalMs = intervalMs
  }

  /** Request a run, resolving once a run that started after this request finishes. */
  request(key: string, work: () => Promise<void>): Promise<void> {
    const state = this.states.get(key) ?? { running: null, dirty: false, lastRun: 0, timer: null }
    this.states.set(key, state)
    return new Promise((resolve, reject) => {
      const waiters = this.waiters.get(key) ?? []
      waiters.push({ resolve, reject })
      this.waiters.set(key, waiters)
      if (state.running) {
        state.dirty = true
        return
      }
      this.schedule(key, work, state)
    })
  }

  private readonly waiters = new Map<
    string,
    { resolve: () => void; reject: (err: unknown) => void }[]
  >()

  private schedule(key: string, work: () => Promise<void>, state: State) {
    if (state.timer) return
    const wait = Math.max(0, state.lastRun + this.intervalMs - Date.now())
    state.timer = setTimeout(() => {
      state.timer = null
      const waiters = this.waiters.get(key) ?? []
      this.waiters.set(key, [])
      state.dirty = false
      state.lastRun = Date.now()
      state.running = work()
        .then(
          () => {
            for (const waiter of waiters) waiter.resolve()
          },
          (err) => {
            for (const waiter of waiters) waiter.reject(err)
          },
        )
        .finally(() => {
          state.running = null
          if (state.dirty || (this.waiters.get(key)?.length ?? 0) > 0)
            this.schedule(key, work, state)
        })
    }, wait)
  }
}
