import { describe, expect, it, vi } from 'vitest'
import { Coalescer } from '../../src/sync/coalescer.ts'

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

describe('Coalescer', () => {
  it('runs simultaneous requests once', async () => {
    const coalescer = new Coalescer(20)
    let runs = 0
    const work = async () => {
      runs++
      await tick(5)
    }
    await Promise.all([
      coalescer.request('a', work),
      coalescer.request('a', work),
      coalescer.request('a', work),
    ])
    expect(runs).toBe(1)
  })

  it('runs once more for requests made while running', async () => {
    const coalescer = new Coalescer(10)
    let runs = 0
    const work = async () => {
      runs++
      await tick(15)
    }
    const first = coalescer.request('a', work)
    await tick(5)
    const second = coalescer.request('a', work)
    const third = coalescer.request('a', work)
    await Promise.all([first, second, third])
    expect(runs).toBe(2)
  })

  it('keeps separate keys independent', async () => {
    const coalescer = new Coalescer(10)
    const seen: string[] = []
    await Promise.all([
      coalescer.request('a', async () => void seen.push('a')),
      coalescer.request('b', async () => void seen.push('b')),
    ])
    expect(seen.sort()).toEqual(['a', 'b'])
  })

  it('waits the interval before running again', async () => {
    vi.useFakeTimers()
    try {
      const coalescer = new Coalescer(40)
      let runs = 0
      const work = async () => {
        runs++
      }
      const first = coalescer.request('a', work)
      await vi.advanceTimersByTimeAsync(0)
      await first
      void coalescer.request('a', work)
      await vi.advanceTimersByTimeAsync(39)
      expect(runs).toBe(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(runs).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects waiters when the work fails', async () => {
    const coalescer = new Coalescer(10)
    await expect(
      coalescer.request('a', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })
})
