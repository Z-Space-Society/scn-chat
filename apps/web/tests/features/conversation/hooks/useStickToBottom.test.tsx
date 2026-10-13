import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useAtBottom,
  useStickToBottom,
} from '../../../../src/features/conversation/hooks/useStickToBottom.ts'

/** A ResizeObserver whose callbacks the test fires. */
function stubResizeObserver() {
  const callbacks: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  return () =>
    act(() => {
      for (const callback of callbacks) callback()
    })
}

/** Animation frames the test runs by hand, 16ms apart. */
function stubFrames() {
  const queue = new Map<number, FrameRequestCallback>()
  let id = 0
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queue.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => void queue.delete(frame))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const step = () => {
    now += 16
    const due = [...queue.values()]
    queue.clear()
    for (const callback of due) callback(now)
  }
  return {
    step,
    /** Run frames until nothing more is asked for. */
    settle: () => {
      for (let i = 0; queue.size > 0 && i < 500; i++) step()
    },
  }
}

let pin: () => void = () => {}
let atBottom = true

function Conversation({ startPinned }: { startPinned?: boolean }) {
  const stick = useStickToBottom(startPinned)
  pin = stick.pin
  atBottom = useAtBottom(stick)
  return (
    <main data-testid="scroller" style={{ overflowY: 'auto' }}>
      <section ref={stick.content} />
    </main>
  )
}

/** Give the scroller fixed sizes, since jsdom does no layout. */
function sizeScroller(
  scroller: HTMLElement,
  sizes: { scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    get: () => sizes.scrollHeight,
  })
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    get: () => sizes.clientHeight,
  })
}

function scrollTo(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top
  act(() => void scroller.dispatchEvent(new Event('scroll')))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useStickToBottom', () => {
  it('follows the content down while the reader is at the bottom', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1300
    resize()
    frames.settle()
    expect(scroller.scrollTop).toBe(900)
  })

  it('glides to the bottom rather than jumping', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1300
    resize()
    expect(scroller.scrollTop).toBe(600)
    frames.step()
    expect(scroller.scrollTop).toBeGreaterThan(600)
    expect(scroller.scrollTop).toBeLessThan(900)
  })

  it('lands at the end at once when a screen or more arrives together', () => {
    const resize = stubResizeObserver()
    stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 0, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    sizes.scrollHeight = 5000
    resize()
    expect(scroller.scrollTop).toBe(4600)
  })

  it('does not take its own glide for the reader scrolling up', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1350
    resize()
    frames.step()
    act(() => void scroller.dispatchEvent(new Event('scroll')))
    expect(atBottom).toBe(true)
    frames.settle()
    expect(scroller.scrollTop).toBe(950)
  })

  it('stops gliding as soon as the reader scrolls up', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1350
    resize()
    frames.step()
    act(() => void scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 })))
    scrollTo(scroller, 500)
    frames.settle()
    expect(scroller.scrollTop).toBe(500)
    expect(atBottom).toBe(false)
  })

  it('jumps instead of gliding when the reader asks for less motion', () => {
    const resize = stubResizeObserver()
    stubFrames()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1300
    resize()
    expect(scroller.scrollTop).toBe(900)
  })

  it('stops following once the reader scrolls up', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 200)
    sizes.scrollHeight = 1300
    resize()
    frames.settle()
    expect(scroller.scrollTop).toBe(200)
  })

  it('glides to the bottom and follows again after pin', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 200)
    act(() => pin())
    frames.settle()
    expect(scroller.scrollTop).toBe(600)
    sizes.scrollHeight = 1300
    resize()
    frames.settle()
    expect(scroller.scrollTop).toBe(900)
  })

  it('says whether the reader is at the bottom', () => {
    stubResizeObserver()
    stubFrames()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    sizeScroller(scroller, { scrollHeight: 1000, clientHeight: 400 })
    scrollTo(scroller, 200)
    expect(atBottom).toBe(false)
    scrollTo(scroller, 600)
    expect(atBottom).toBe(true)
    scrollTo(scroller, 200)
    act(() => pin())
    expect(atBottom).toBe(true)
  })

  it('counts content too short to scroll as at the bottom, even when it starts unpinned', () => {
    const resize = stubResizeObserver()
    stubFrames()
    const { getByTestId } = render(<Conversation startPinned={false} />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 300, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    resize()
    expect(atBottom).toBe(true)
    sizes.scrollHeight = 1000
    resize()
    expect(atBottom).toBe(false)
  })

  it('does not follow until pinned when it starts unpinned', () => {
    const resize = stubResizeObserver()
    const frames = stubFrames()
    const { getByTestId } = render(<Conversation startPinned={false} />)
    const scroller = getByTestId('scroller')
    sizeScroller(scroller, { scrollHeight: 1000, clientHeight: 400 })
    scroller.scrollTop = 100
    resize()
    frames.settle()
    expect(scroller.scrollTop).toBe(100)
  })
})
