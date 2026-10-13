import { type RefObject, useEffect, useEffectEvent } from 'react'

interface Options {
  /** Whether a press outside closes it, as for a menu. A form stays until it is closed. */
  outside?: boolean
}

/**
 * Closes a floating menu or panel while it is open: on Escape, and on a press outside the elements
 * it belongs to, such as the menu and the button that opened it.
 */
export function useDismiss(
  open: boolean,
  inside: RefObject<HTMLElement | null>[],
  onDismiss: (reason: 'escape' | 'outside') => void,
  options: Options = {},
) {
  const outside = options.outside ?? true
  const dismiss = useEffectEvent(onDismiss)
  const isInside = useEffectEvent((target: Node) =>
    inside.some((element) => element.current?.contains(target)),
  )
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss('escape')
    }
    const onPointerDown = (event: PointerEvent) => {
      if (outside && !isInside(event.target as Node)) dismiss('outside')
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, outside])
}
