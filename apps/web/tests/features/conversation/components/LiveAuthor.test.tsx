import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaitingAuthor } from '../../../../src/features/conversation/components/LiveAuthor.tsx'

afterEach(() => vi.useRealTimers())

describe('WaitingAuthor', () => {
  it('counts the wait a second at a time, waking once a second', () => {
    vi.useFakeTimers({ now: 10_400 })
    render(<WaitingAuthor model="claude" since={new Date(10_000).toISOString()} />)
    expect(screen.queryByText(/s$/)).toBeNull()
    act(() => vi.advanceTimersByTime(620))
    expect(screen.getByText('1s')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByText('2s')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)
  })
})
