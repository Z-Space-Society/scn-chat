import { type CSSProperties, type RefObject, useLayoutEffect, useState } from 'react'

/** The room a floating element wants below its anchor before it opens above instead. */
const ROOM_BELOW = 260
const GAP = 4

/**
 * Where a floating element sits by its anchor, fixed to the window so no panel clips it: below the
 * anchor, or above it when there is little room below in the part of the window the reader can see,
 * as over an on-screen keyboard, kept inside the window, and moved with the anchor as the page
 * scrolls or resizes, or the keyboard comes and goes. It lines up with the anchor's start, or with its end for a
 * menu opened from a button at the end of a row.
 */
export function usePlacement(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
  align: 'start' | 'end' = 'start',
): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const box = anchor.current?.getBoundingClientRect()
      if (!box) return
      const width = floating.current?.offsetWidth ?? 0
      // The room the reader can see, which an on-screen keyboard narrows.
      const view = window.visualViewport
      const top = view?.offsetTop ?? 0
      const bottom = view ? view.offsetTop + view.height : window.innerHeight
      const below = bottom - box.bottom
      const start = align === 'end' ? box.right - width : box.left
      const left = Math.max(GAP, Math.min(start, window.innerWidth - width - GAP))
      setPosition(
        below < ROOM_BELOW && box.top - top > below
          ? { left, minWidth: box.width, bottom: window.innerHeight - box.top + GAP }
          : { left, minWidth: box.width, top: box.bottom + GAP },
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    // An on-screen keyboard resizes and scrolls only the visual viewport.
    window.visualViewport?.addEventListener('resize', place)
    window.visualViewport?.addEventListener('scroll', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
      window.visualViewport?.removeEventListener('scroll', place)
    }
  }, [open, anchor, floating, align])
  return position
}
