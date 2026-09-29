import { describe, expect, it } from 'vitest'
import { childrenByParent, choicesFor, currentBranch } from '../../src/lib/branch.ts'

const m = (rkey: string, parent?: string, createdAt = '2026-09-26T00:00:00Z') => ({
  rkey,
  record: { parent, createdAt },
})

describe('currentBranch', () => {
  const messages = [
    m('a', undefined, '2026-09-26T00:00:00Z'),
    m('a.r0', 'a', '2026-09-26T00:01:00Z'),
    m('a.r1', 'a', '2026-09-26T00:02:00Z'),
    m('b', 'a.r1', '2026-09-26T00:03:00Z'),
    m('c', 'a.r0', '2026-09-26T00:04:00Z'),
  ]

  it('follows the newest sibling at each level by default', () => {
    expect(currentBranch(messages, {}).map((s) => s.message.rkey)).toEqual(['a', 'a.r1', 'b'])
  })

  it('groups messages whose parent is missing at the root, where the root choice picks them', () => {
    const orphans = [m('x', 'gone', '2026-09-26T00:00:00Z'), m('y', 'gone', '2026-09-26T00:01:00Z')]
    expect(currentBranch(orphans, {})[0]).toMatchObject({ parent: null, message: { rkey: 'y' } })
    expect(currentBranch(orphans, { '': 'x' })[0]?.message.rkey).toBe('x')
  })

  it('follows a chosen sibling and what comes after it', () => {
    expect(currentBranch(messages, { a: 'a.r0' }).map((s) => s.message.rkey)).toEqual([
      'a',
      'a.r0',
      'c',
    ])
  })

  it('reports each step siblings and position', () => {
    const step = currentBranch(messages, {})[1]
    expect(step?.siblings.map((s) => s.rkey)).toEqual(['a.r0', 'a.r1'])
    expect(step?.index).toBe(1)
  })
})

describe('childrenByParent', () => {
  it('orders regenerations by attempt number, not by key', () => {
    const replies = Array.from({ length: 11 }, (_, i) => m(`u.r${i}`, 'u'))
    const order = childrenByParent([m('u'), ...replies])
      .get('u')
      ?.map((r) => r.rkey)
    expect(order?.at(-1)).toBe('u.r10')
    expect(order?.[2]).toBe('u.r2')
  })

  it('treats messages with a missing parent as roots', () => {
    expect(
      childrenByParent([m('orphan', 'gone')])
        .get(null)
        ?.map((r) => r.rkey),
    ).toEqual(['orphan'])
  })
})

describe('choicesFor', () => {
  const messages = [
    m('a', undefined, '2026-09-26T00:00:00Z'),
    m('a.r0', 'a', '2026-09-26T00:01:00Z'),
    m('a.r1', 'a', '2026-09-26T00:02:00Z'),
    m('c', 'a.r0', '2026-09-26T00:04:00Z'),
  ]

  it('chooses every ancestor of the message, so the branch passes through it', () => {
    const choices = choicesFor(messages, 'c')
    expect(currentBranch(messages, choices).map((s) => s.message.rkey)).toEqual(['a', 'a.r0', 'c'])
  })

  it('chooses nothing for an unknown message', () => {
    expect(choicesFor(messages, 'gone')).toEqual({})
  })
})
