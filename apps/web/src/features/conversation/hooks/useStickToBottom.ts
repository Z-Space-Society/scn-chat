import { useRef, useState, useSyncExternalStore } from 'react'

/** How close to the bottom, in pixels, still counts as at the bottom. */
const SLACK = 40

/**
 * How quickly a glide closes the gap to the bottom: each this many milliseconds, about two thirds
 * of what is left. A long jump covers most of its way in a few frames, then settles.
 */
const GLIDE_MS = 90

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function scrollParent(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }
  return document.scrollingElement as HTMLElement
}

/** A boolean that components subscribe to, so changing it rerenders only those that read it. */
function flag(initial: boolean) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: boolean) => {
      if (next === value) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export interface StickToBottom {
  /** Goes on the content, and follows its scrolling parent while it is mounted. */
  ref: (content: HTMLElement | null) => (() => void) | undefined
  /** Glide to the bottom and follow the content again. */
  pin: () => void
  /** Whether it is following, which `useAtBottom` reads. */
  atBottom: () => boolean
  subscribe: (listener: () => void) => () => void
}

/**
 * Keep the scroll position at the bottom as the content grows, while the reader is there, gliding
 * down rather than jumping. Once they scroll up it stops following, until they scroll back down or
 * `pin` is called. Whether it is following is read with `useAtBottom`, so the component that holds
 * the content does not rerender as it changes.
 */
export function useStickToBottom(startPinned = true): StickToBottom {
  const pinned = useRef(startPinned)
  const [atBottom] = useState(() => flag(startPinned))
  const scroller = useRef<HTMLElement | null>(null)
  // The running glide's next frame, and where it last put the scroll position, so a scroll event
  // it caused is not taken for the reader's.
  const frame = useRef<number | null>(null)
  const placed = useRef<number | null>(null)

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    placed.current = null
  }

  /** Glide to the bottom, or jump there when asked to or when the reader wants less motion. */
  const toBottom = (jump = false) => {
    const element = scroller.current
    if (!element) return
    const bottom = () => Math.max(0, element.scrollHeight - element.clientHeight)
    if (jump || reducedMotion()) {
      stop()
      element.scrollTop = bottom()
      return
    }
    if (frame.current !== null) return
    let last = performance.now()
    const step = (now: number) => {
      const gap = bottom() - element.scrollTop
      if (!pinned.current || gap <= 1) {
        if (pinned.current) element.scrollTop = bottom()
        stop()
        return
      }
      const share = 1 - Math.exp(-(now - last) / GLIDE_MS)
      last = now
      element.scrollTop += Math.min(gap, Math.max(1, gap * share))
      placed.current = element.scrollTop
      frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
  }

  const ref = (content: HTMLElement | null) => {
    if (!content) return
    const parent = scrollParent(content)
    scroller.current = parent
    const events = parent === document.scrollingElement ? window : parent
    const gap = () => parent.scrollHeight - parent.scrollTop - parent.clientHeight
    const nearBottom = () => gap() <= SLACK
    const onScroll = () => {
      // The glide's own steps are not the reader scrolling.
      if (placed.current !== null && Math.abs(parent.scrollTop - placed.current) <= 1) return
      pinned.current = nearBottom()
      atBottom.set(pinned.current)
    }
    // Reaching to scroll ends a glide at once, so it never fights the reader for the page.
    const onWheel = (event: Event) => {
      if ((event as WheelEvent).deltaY < 0) pinned.current = false
      stop()
    }
    // A press on the scroller itself, rather than on what it holds, is a grab of its scrollbar.
    const onPointerDown = (event: Event) => {
      if (event.target === parent) stop()
    }
    events.addEventListener('scroll', onScroll, { passive: true })
    events.addEventListener('wheel', onWheel, { passive: true })
    events.addEventListener('touchmove', stop, { passive: true })
    events.addEventListener('pointerdown', onPointerDown, { passive: true })
    const observer = new ResizeObserver(() => {
      // A screen or more arriving at once, as when a chat's messages load after it opens, is shown
      // at its end straight away. Only smaller growth, like a reply streaming in, glides.
      if (pinned.current) toBottom(gap() > parent.clientHeight)
      // Content that grows or shrinks without following moves the bottom without a scroll.
      else atBottom.set(nearBottom())
    })
    observer.observe(content)
    if (pinned.current) toBottom(true)
    return () => {
      events.removeEventListener('scroll', onScroll)
      events.removeEventListener('wheel', onWheel)
      events.removeEventListener('touchmove', stop)
      events.removeEventListener('pointerdown', onPointerDown)
      observer.disconnect()
      stop()
      scroller.current = null
    }
  }

  const pin = () => {
    pinned.current = true
    atBottom.set(true)
    toBottom()
  }

  return { ref, pin, atBottom: atBottom.get, subscribe: atBottom.subscribe }
}

/** Whether the reader is at the bottom, as for a button that jumps back down. */
export function useAtBottom(stick: StickToBottom): boolean {
  return useSyncExternalStore(stick.subscribe, stick.atBottom, stick.atBottom)
}
