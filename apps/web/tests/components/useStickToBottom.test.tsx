import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStickToBottom } from '../../src/components/useStickToBottom.ts'

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

let pin: () => void = () => {}

function Conversation({ startPinned }: { startPinned?: boolean }) {
  const content = useRef<HTMLElement>(null)
  pin = useStickToBottom(content, startPinned).pin
  return (
    <main data-testid="scroller" style={{ overflowY: 'auto' }}>
      <section ref={content} />
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

afterEach(() => vi.unstubAllGlobals())

describe('useStickToBottom', () => {
  it('follows the content down while the reader is at the bottom', () => {
    const resize = stubResizeObserver()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 600)
    sizes.scrollHeight = 1300
    resize()
    expect(scroller.scrollTop).toBe(1300)
  })

  it('stops following once the reader scrolls up', () => {
    const resize = stubResizeObserver()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 200)
    sizes.scrollHeight = 1300
    resize()
    expect(scroller.scrollTop).toBe(200)
  })

  it('jumps to the bottom and follows again after pin', () => {
    const resize = stubResizeObserver()
    const { getByTestId } = render(<Conversation />)
    const scroller = getByTestId('scroller')
    const sizes = { scrollHeight: 1000, clientHeight: 400 }
    sizeScroller(scroller, sizes)
    scrollTo(scroller, 200)
    act(() => pin())
    expect(scroller.scrollTop).toBe(1000)
    sizes.scrollHeight = 1300
    resize()
    expect(scroller.scrollTop).toBe(1300)
  })

  it('does not follow until pinned when it starts unpinned', () => {
    const resize = stubResizeObserver()
    const { getByTestId } = render(<Conversation startPinned={false} />)
    const scroller = getByTestId('scroller')
    sizeScroller(scroller, { scrollHeight: 1000, clientHeight: 400 })
    scroller.scrollTop = 100
    resize()
    expect(scroller.scrollTop).toBe(100)
  })
})
