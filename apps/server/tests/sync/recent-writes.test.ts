import { describe, expect, it } from 'vitest'
import { RecentWrites } from '../../src/sync/recent-writes.ts'

describe('RecentWrites', () => {
  it('remembers a CID until its time to live passes', () => {
    const writes = new RecentWrites(1_000)
    writes.add('bafy1', 0)
    expect(writes.has('bafy1', 500)).toBe(true)
    expect(writes.has('bafy1', 1_500)).toBe(false)
    expect(writes.has('bafy2', 0)).toBe(false)
  })
})
