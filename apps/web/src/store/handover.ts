export type HandoverState = 'waiting' | 'active' | 'busy' | 'inactive'

type LockManagerLike = {
  request(name: string, options: { steal: boolean }, callback: () => Promise<void>): Promise<void>
}
type ChannelLike = {
  postMessage(message: unknown): void
  onmessage: ((event: { data: unknown }) => void) | null
}

export type HandoverOptions = {
  name: string
  locks: LockManagerLike
  channel: ChannelLike
  open: () => Promise<void>
  pause: () => Promise<void> | void
  onState: (state: HandoverState) => void
  retryForMs?: number
  retryEveryMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Move the store to whichever tab claims it, retrying the open for a few seconds. */
export function createHandover(options: HandoverOptions) {
  const retryFor = options.retryForMs ?? 3_000
  const retryEvery = options.retryEveryMs ?? 200
  let state: HandoverState = 'inactive'
  let releaseLock: (() => void) | undefined
  const set = (next: HandoverState) => {
    state = next
    options.onState(next)
  }

  const lose = async () => {
    releaseLock?.()
    releaseLock = undefined
    await options.pause()
    set('inactive')
  }

  options.channel.onmessage = (event) => {
    if (event.data === 'release' && state === 'active') void lose()
  }

  async function openWithRetry(): Promise<boolean> {
    const deadline = Date.now() + retryFor
    for (;;) {
      try {
        await options.open()
        return true
      } catch (err) {
        if (Date.now() >= deadline) {
          console.warn('Could not open the local store', err)
          return false
        }
        await sleep(retryEvery)
      }
    }
  }

  return {
    get state() {
      return state
    },
    /** Take the store for this tab, on load, on focus, or from the busy banner's retry. */
    async claim(): Promise<HandoverState> {
      if (state === 'active' || state === 'waiting') return state
      set('waiting')
      options.channel.postMessage('release')
      let settled: (s: HandoverState) => void = () => {}
      const result = new Promise<HandoverState>((resolve) => {
        settled = resolve
      })
      options.locks
        .request(options.name, { steal: true }, async () => {
          const opened = await openWithRetry()
          set(opened ? 'active' : 'busy')
          settled(state)
          if (!opened) return
          await new Promise<void>((resolve) => {
            releaseLock = resolve
          })
        })
        .catch(async (err: unknown) => {
          if ((err as { name?: string }).name !== 'AbortError')
            console.error('The store lock failed', err)
          if (state === 'active') await lose()
          else set('inactive')
          settled(state)
        })
      return result
    },
  }
}
