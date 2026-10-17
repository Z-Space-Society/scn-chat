import type { ComponentProps } from 'react'
import { cn } from '../cn.ts'

/**
 * A text field, select, or textarea: a white card with a hairline border that rings green while
 * you type in it.
 */
export const field =
  'rounded-small border border-line bg-raised px-2.75 py-1.5 text-ink transition-[border-color,box-shadow] duration-(--dur-feedback) placeholder:text-faint focus-visible:border-focus focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent-soft disabled:opacity-50'

/**
 * A field for code-like text, such as hosts one per line, in the mono font a step smaller, but
 * never under the size that keeps phones from zooming in on it.
 */
export const monoField = 'font-mono text-[length:max(var(--input-floor),var(--text-small))]'

/**
 * For a field whose text is taken exactly, such as a handle, a URL, or a model ID, which phone
 * keyboards would otherwise capitalize and correct.
 */
export const literalInput = {
  autoCapitalize: 'off',
  autoCorrect: 'off',
  spellCheck: false,
} as const

/**
 * For a secret's field. Password managers ignore autocomplete="off" on a password field and would
 * fill in the user's own password, which would replace the saved secret.
 */
export const secretInput = {
  ...literalInput,
  autoComplete: 'new-password',
  'data-1p-ignore': true,
  'data-lpignore': true,
} as const

type InputProps = Omit<ComponentProps<'input'>, 'type'>

/**
 * An on/off setting as a switch. It is still a checkbox to the browser and screen readers, with
 * its knob drawn beside it so every browser can slide it. data-switch lets a setting row keep it
 * beside its words in a narrow column.
 */
export function Switch(props: InputProps) {
  const { className, ...input } = props
  return (
    <span data-switch className={cn('relative inline-flex h-5.25 w-8.75 shrink-0', className)}>
      <input
        {...input}
        type="checkbox"
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-full border border-line bg-hover transition-[background-color,border-color] duration-(--dur-feedback) checked:border-accent checked:bg-accent disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute start-0.5 top-0.5 size-4.25 rounded-full bg-knob transition-[translate] duration-(--dur-layout) ease-out peer-checked:translate-x-3.5 peer-disabled:opacity-50 motion-reduce:transition-none rtl:peer-checked:-translate-x-3.5"
      />
    </span>
  )
}

/**
 * A radio, where a row of a card is one of a few choices: a grey ring, and a green ring around a
 * green dot when chosen. Its edge takes the quiet icon grey, since a control's edge needs 3:1 and a
 * field's border doesn't clear it.
 */
export function Radio(props: InputProps) {
  const { className, ...input } = props
  return (
    <span className={cn('relative inline-grid size-4.5 shrink-0 place-items-center', className)}>
      <input
        {...input}
        type="radio"
        className="peer border-(length:--control-edge) absolute inset-0 m-0 cursor-pointer appearance-none rounded-full border-icon-quiet bg-raised transition-[border-color] duration-(--dur-feedback) checked:border-accent-mark"
      />
      <span
        aria-hidden
        className="pointer-events-none invisible relative size-2.25 rounded-full bg-accent-mark peer-checked:visible"
      />
    </span>
  )
}
