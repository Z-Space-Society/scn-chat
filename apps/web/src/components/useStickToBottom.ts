import { type RefObject, useCallback, useEffect, useRef } from 'react'

/** How close to the bottom, in pixels, still counts as at the bottom. */
const SLACK = 40

/** The nearest ancestor that scrolls, or the page. */
function scrollParent(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }
  return document.scrollingElement as HTMLElement
}

/**
 * Keep the scroll position at the bottom as the content grows, while the reader is there. Once
 * they scroll up it stops following, until they scroll back down or `pin` is called.
 */
export function useStickToBottom(content: RefObject<HTMLElement | null>, startPinned = true) {
  const pinned = useRef(startPinned)
  const scroller = useRef<HTMLElement | null>(null)

  const toBottom = useCallback(() => {
    const element = scroller.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  useEffect(() => {
    const element = content.current
    if (!element) return
    const parent = scrollParent(element)
    scroller.current = parent
    const events = parent === document.scrollingElement ? window : parent
    const onScroll = () => {
      pinned.current = parent.scrollHeight - parent.scrollTop - parent.clientHeight <= SLACK
    }
    events.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      if (pinned.current) toBottom()
    })
    observer.observe(element)
    if (pinned.current) toBottom()
    return () => {
      events.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [content, toBottom])

  /** Jump to the bottom and follow the content again. */
  const pin = useCallback(() => {
    pinned.current = true
    toBottom()
  }, [toBottom])

  return { pin }
}
