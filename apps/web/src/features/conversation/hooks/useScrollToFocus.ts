import { useEffect, useRef } from 'react'

/**
 * Scroll to the focused message, `m-<rkey>`, once it is on screen. A message focused from the
 * conversation itself, as by switching siblings, stays where it is: mark it with `stayOn` first.
 */
export function useScrollToFocus(focus: string | undefined, shown: boolean) {
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!focus || !shown || scrolledTo.current === focus) return
    scrolledTo.current = focus
    document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, shown])
  return {
    stayOn: (rkey: string) => {
      scrolledTo.current = rkey
    },
  }
}
