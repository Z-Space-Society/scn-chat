import { type CSSProperties, type RefObject, useLayoutEffect, useState } from 'react'

/** The room a floating element wants below its anchor before it opens above instead. */
const ROOM_BELOW = 260
const GAP = 4

/**
 * Where a floating element sits by its anchor, fixed to the window so no panel clips it: below the
 * anchor, or above it when there is little room below, kept inside the window, and moved with the
 * anchor as the page scrolls or resizes. It lines up with the anchor's start, or with its end for a
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
      const below = window.innerHeight - box.bottom
      const start = align === 'end' ? box.right - width : box.left
      const left = Math.max(GAP, Math.min(start, window.innerWidth - width - GAP))
      setPosition(
        below < ROOM_BELOW && box.top > below
          ? { left, minWidth: box.width, bottom: window.innerHeight - box.top + GAP }
          : { left, minWidth: box.width, top: box.bottom + GAP },
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, floating, align])
  return position
}
