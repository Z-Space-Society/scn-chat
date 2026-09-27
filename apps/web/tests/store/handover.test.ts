import { describe, expect, it, vi } from 'vitest'
import { createHandover, type HandoverState } from '../../src/store/handover.ts'

/** Web Locks with steal: the previous holder's request rejects with an AbortError. */
function fakeLocks() {
  const holders = new Map<string, (err: Error) => void>()
  return {
    request(name: string, _options: { steal: boolean }, callback: () => Promise<void>) {
      holders.get(name)?.(Object.assign(new Error('stolen'), { name: 'AbortError' }))
      return new Promise<void>((resolve, reject) => {
        holders.set(name, reject)
        callback().then(resolve, reject)
      })
    },
  }
}

/** Broadcast channels that deliver to every other tab. */
function fakeChannels() {
  const channels: {
    onmessage: ((e: { data: unknown }) => void) | null
    postMessage(m: unknown): void
  }[] = []
  return () => {
    const channel = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage(message: unknown) {
        for (const other of channels) if (other !== channel) other.onmessage?.({ data: message })
      },
    }
    channels.push(channel)
    return channel
  }
}

function tab(
  locks: ReturnType<typeof fakeLocks>,
  channel: ReturnType<ReturnType<typeof fakeChannels>>,
  db: { holder: string | null },
  id: string,
  options: { failOpen?: () => boolean } = {},
) {
  const states: HandoverState[] = []
  const handover = createHandover({
    name: 'scn-chat-store',
    locks,
    channel,
    open: async () => {
      if (options.failOpen?.() || (db.holder && db.holder !== id)) throw new Error('database busy')
      db.holder = id
    },
    pause: () => {
      if (db.holder === id) db.holder = null
    },
    onState: (state) => states.push(state),
    retryForMs: 100,
    retryEveryMs: 10,
  })
  return { handover, states }
}

describe('createHandover', () => {
  it('opens the store in the first tab', async () => {
    const locks = fakeLocks()
    const channels = fakeChannels()
    const db = { holder: null as string | null }
    const a = tab(locks, channels(), db, 'a')
    expect(await a.handover.claim()).toBe('active')
    expect(db.holder).toBe('a')
  })

  it('moves the store to a newly focused tab with no busy state, and the old tab keeps its screen inactive', async () => {
    const locks = fakeLocks()
    const channels = fakeChannels()
    const db = { holder: null as string | null }
    const a = tab(locks, channels(), db, 'a')
    const b = tab(locks, channels(), db, 'b')
    await a.handover.claim()
    expect(await b.handover.claim()).toBe('active')
    await vi.waitFor(() => expect(a.handover.state).toBe('inactive'))
    expect(db.holder).toBe('b')
    expect(b.states).not.toContain('busy')
  })

  it('lets the old tab take the store back when focused again', async () => {
    const locks = fakeLocks()
    const channels = fakeChannels()
    const db = { holder: null as string | null }
    const a = tab(locks, channels(), db, 'a')
    const b = tab(locks, channels(), db, 'b')
    await a.handover.claim()
    await b.handover.claim()
    await vi.waitFor(() => expect(a.handover.state).toBe('inactive'))
    expect(await a.handover.claim()).toBe('active')
    await vi.waitFor(() => expect(b.handover.state).toBe('inactive'))
    expect(db.holder).toBe('a')
  })

  it('shows busy when the store cannot be opened in time, and a retry succeeds once it can', async () => {
    const locks = fakeLocks()
    const channels = fakeChannels()
    const db = { holder: null as string | null }
    let frozen = true
    const a = tab(locks, channels(), db, 'a', { failOpen: () => frozen })
    expect(await a.handover.claim()).toBe('busy')
    frozen = false
    expect(await a.handover.claim()).toBe('active')
  })

  it('never has two tabs active at once', async () => {
    const locks = fakeLocks()
    const channels = fakeChannels()
    const db = { holder: null as string | null }
    const tabs = ['a', 'b', 'c'].map((id) => tab(locks, channels(), db, id))
    for (const t of [...tabs, ...tabs]) {
      await t.handover.claim()
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(tabs.filter((x) => x.handover.state === 'active').length).toBeLessThanOrEqual(1)
    }
  })
})
