import { useEffect, useRef, useState } from 'react'

/** How many of a list's items show before the rest fold behind a button. */
export const foldAt = 7

/**
 * A list of resources, such as a search's results, cut to its first seven items until opened. A list that would hide only one item shows it instead. Opening it moves focus
 * to the first link it showed, so the keyboard carries on from where the list was cut.
 */
export function useFold<T>(items: T[]) {
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLOListElement & HTMLUListElement>(null)
  const opened = useRef(false)

  useEffect(() => {
    if (!open || !opened.current) return
    opened.current = false
    list.current?.children[foldAt]?.querySelector('a')?.focus()
  }, [open])

  const folds = items.length > foldAt + 1
  return {
    shown: folds && !open ? items.slice(0, foldAt) : items,
    /** How many items are folded away, or 0 when none are. */
    hidden: folds && !open ? items.length - foldAt : 0,
    /** Whether the list has a button to open or close it. */
    folds,
    open,
    list,
    toggle() {
      opened.current = !open
      setOpen(!open)
    },
  }
}
