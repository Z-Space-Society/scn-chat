import type { CSSProperties, ReactNode, Ref } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  ref: Ref<HTMLDivElement>
  id: string
  style: CSSProperties
  className: string
  /**
   * Render in place rather than at the end of the page, for a menu whose row styles itself by the
   * focus inside it.
   */
  inline?: boolean
  children: ReactNode
}

/** The floating element of `usePopover`, while it is open. Spread the hook's `popover` on it. */
// The ref is kept out of `props`, as in the composer, so React Compiler still memoizes this.
export function Popover({ ref, ...props }: Props) {
  if (!props.open) return null
  const card = (
    <div ref={ref} id={props.id} style={props.style} className={props.className}>
      {props.children}
    </div>
  )
  if (props.inline) return card
  return createPortal(card, document.body)
}
