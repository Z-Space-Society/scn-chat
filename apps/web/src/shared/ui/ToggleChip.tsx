import type { ReactNode } from 'react'
import { CheckIcon } from '../icons.tsx'

interface Props {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: ReactNode
}

/**
 * A small button that stays pressed while what it names is on, such as one thing a model can do.
 * Pressed, it turns green and gains a check, so its state doesn't rest on color alone.
 */
export function ToggleChip(props: Props) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={() => props.onPressedChange(!props.pressed)}
      className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-badge border border-line px-2 py-0.5 text-muted text-small transition-[background-color,border-color,color] duration-(--dur-feedback) [-webkit-tap-highlight-color:transparent] hover:bg-hover aria-pressed:border-accent-border aria-pressed:bg-accent-soft aria-pressed:font-medium aria-pressed:text-accent-strong aria-pressed:hover:bg-accent-soft-hover"
    >
      {props.pressed && <CheckIcon />}
      {props.children}
    </button>
  )
}
