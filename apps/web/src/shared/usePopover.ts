import { useId, useRef } from 'react'
import { useDismiss } from './useDismiss.ts'
import { usePlacement } from './usePlacement.ts'

/**
 * A menu or card that floats by the button opening it: placed by the button, closed on Escape or a
 * press outside, with the focus back on the button after Escape. The focus starts at the first
 * button of each element given `popover.ref`, so the keyboard lands inside the menu as it opens,
 * and inside a view as it takes another's place. Spread `trigger` on the button and `popover` on
 * a `Popover`.
 */
export function usePopover(open: boolean, onClose: () => void, align: 'start' | 'end' = 'start') {
  const id = useId()
  const anchor = useRef<HTMLButtonElement>(null)
  const floating = useRef<HTMLDivElement>(null)
  const position = usePlacement(open, anchor, floating, align)
  useDismiss(open, [anchor, floating], (reason) => {
    onClose()
    if (reason === 'escape') anchor.current?.focus()
  })
  const ref = (element: HTMLDivElement | null) => {
    floating.current = element
    // Only on arriving, so a rerender leaves the focus wherever the keyboard has moved it since.
    if (element && !element.contains(document.activeElement))
      element.querySelector<HTMLElement>('button')?.focus()
  }
  return {
    anchor,
    trigger: { 'aria-expanded': open, 'aria-controls': open ? id : undefined },
    popover: { open, ref, id, style: position },
  }
}
