import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatSeconds,
  resetStepClocks,
  stepDuration,
  useStepClock,
} from '../../src/parts/step-clock.ts'
import { type Step, stepsSummary } from '../../src/parts/steps.ts'

afterEach(() => {
  resetStepClocks()
  vi.useRealTimers()
})

describe('formatSeconds', () => {
  it('counts seconds, then minutes and padded seconds', () => {
    expect(formatSeconds(0)).toBe('0s')
    expect(formatSeconds(-3)).toBe('0s')
    expect(formatSeconds(42.9)).toBe('42s')
    expect(formatSeconds(65)).toBe('1m 05s')
    expect(formatSeconds(600)).toBe('10m 00s')
  })
})

function Clock(props: { id?: string; running: boolean }) {
  const clock = useStepClock(props.id, props.running)
  return <p>{JSON.stringify(clock)}</p>
}

describe('useStepClock', () => {
  it('ticks while a step runs, then keeps how long it ran', () => {
    vi.useFakeTimers({ now: 0 })
    const { rerender } = render(<Clock id="r:a" running />)
    expect(screen.getByText('{"elapsed":0}')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.getByText('{"elapsed":3}')).toBeInTheDocument()
    rerender(<Clock id="r:a" running={false} />)
    expect(screen.getByText('{"duration":3}')).toBeInTheDocument()
    expect(stepDuration('r:a')).toBe(3)
  })

  it('knows nothing of a step only seen finished, or without an id', () => {
    render(<Clock id="r:b" running={false} />)
    render(<Clock running />)
    expect(screen.getAllByText('{}')).toHaveLength(2)
  })
})

describe('stepsSummary', () => {
  const steps = [
    { kind: 'reasoning', key: 'a', text: '' },
    { kind: 'tool', key: 'b', call: { $type: 'x', tool: 'web_search' } },
    { kind: 'reasoning', key: 'c', text: '' },
  ] as Step[]

  it('totals the thinking time when every thought was timed', () => {
    const times: Record<string, number> = { a: 4.2, c: 7.6 }
    expect(stepsSummary(steps, (s) => times[s.key], formatSeconds)).toBe(
      'Thought for 12s · web_search',
    )
  })

  it('says only "Thought" when any thought went untimed', () => {
    expect(stepsSummary(steps, (s) => (s.key === 'a' ? 4 : undefined))).toBe(
      'Thought ×2 · web_search',
    )
  })
})
