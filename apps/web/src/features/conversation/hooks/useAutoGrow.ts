import { type RefObject, useLayoutEffect } from 'react'

/** Whether CSS can size a textarea to its text, with `field-sizing: content`. */
const sizedByCss = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content') === true

/**
 * Grow a textarea with its text in browsers whose CSS can't, so it matches `field-sizing: content`
 * on the composer's box. Its `max-height` still caps it, and it scrolls past that.
 */
export function useAutoGrow(box: RefObject<HTMLTextAreaElement | null>, text: string) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text.
  useLayoutEffect(() => {
    const element = box.current
    if (!element || sizedByCss()) return
    element.style.height = 'auto'
    const borders = element.offsetHeight - element.clientHeight
    element.style.height = `${element.scrollHeight + borders}px`
  }, [box, text])
}
