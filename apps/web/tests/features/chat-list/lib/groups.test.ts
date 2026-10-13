import { describe, expect, it } from 'vitest'
import { dateLabel, groupByDate } from '../../../../src/features/chat-list/lib/groups.ts'

const now = new Date(2026, 9, 7, 15, 0)
const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour)

describe('dateLabel', () => {
  it('names recent days, then the month, adding the year only for other years', () => {
    expect(dateLabel(at(9, 7, 1), now)).toBe('Today')
    expect(dateLabel(at(9, 6, 23), now)).toBe('Yesterday')
    expect(dateLabel(at(9, 2), now)).toBe('Previous 7 days')
    expect(dateLabel(at(8, 20), now)).toBe('Previous 30 days')
    expect(dateLabel(at(6, 1), now)).toMatch(/July/)
    expect(dateLabel(new Date(2025, 6, 1), now)).toMatch(/2025/)
  })
})

describe('groupByDate', () => {
  it('keeps the order and puts each chat under its heading', () => {
    const chats = [
      { skey: 'a', updatedAt: at(9, 7, 9).toISOString() },
      { skey: 'b', updatedAt: at(9, 7, 8).toISOString() },
      { skey: 'c', updatedAt: at(9, 6).toISOString() },
      { skey: 'd', updatedAt: 'not a date' },
    ]
    expect(groupByDate(chats, now).map((g) => [g.label, g.items.map((c) => c.skey)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Older', ['d']],
    ])
  })
})
