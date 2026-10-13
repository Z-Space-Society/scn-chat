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

/**
 * Where a submenu sits by its row in a floating list, fixed to the window: beside the row toward
 * the end of the line, or toward its start when there is no room, with its first option level with
 * the row, and kept inside the window.
 */
export function useSidePlacement(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  floating: RefObject<HTMLElement | null>,
): CSSProperties {
  const [position, setPosition] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const row = anchor.current
      const list = floating.current
      if (!row || !list) return
      const box = row.getBoundingClientRect()
      // Beside the edge of the list the row is in, not the row's own edge inside its padding.
      const outer = row.closest('[role="listbox"]')?.getBoundingClientRect() ?? box
      // The list's padding, so its first option rather than its edge lines up with the row.
      const inset = (list.firstElementChild as HTMLElement | null)?.offsetTop ?? 0
      const width = list.offsetWidth
      const rtl = getComputedStyle(row).direction === 'rtl'
      const after = rtl ? outer.left - width - GAP : outer.right + GAP
      const before = rtl ? outer.right + GAP : outer.left - width - GAP
      const fits = (left: number) => left >= GAP && left + width <= window.innerWidth - GAP
      const start = fits(after) || !fits(before) ? after : before
      const left = Math.max(GAP, Math.min(start, window.innerWidth - width - GAP))
      const top = Math.max(
        GAP,
        Math.min(box.top - inset, window.innerHeight - list.offsetHeight - GAP),
      )
      setPosition({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, floating])
  return position
}
