import { describe, expect, it } from 'vitest'
import { parseDate, shortTime } from '../../src/shared/time.ts'

const now = new Date(2026, 9, 7, 15, 0)
const clock = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

describe('shortTime', () => {
  it('shows the time today, Yesterday, and the date before that', () => {
    const today = new Date(2026, 9, 7, 9, 5)
    expect(shortTime(today, now)).toBe(clock(today))
    expect(shortTime(new Date(2026, 9, 6, 23), now)).toBe('Yesterday')
    expect(shortTime(new Date(2026, 9, 1, 9), now)).not.toMatch(/2026|:/)
    expect(shortTime(new Date(2025, 6, 1, 9), now)).toMatch(/2025/)
  })
})

describe('parseDate', () => {
  it('reads an ISO string and nothing else', () => {
    expect(parseDate('2026-10-07T12:00:00Z')?.toISOString()).toBe('2026-10-07T12:00:00.000Z')
    expect(parseDate('t')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
  })
})
