import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../cn.ts'

/**
 * A control: a small white card with a hairline border that gives a little when pressed. The main
 * action, such as a form's submit, Send, or a page's Add link, wears the green badge, as status
 * that is live or good does. Something that can't be undone is red, and a second action beside a
 * status reads as quiet text until hovered.
 */
export const button = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-small border font-medium no-underline transition-[background-color,color,scale] duration-150 ease-out [-webkit-tap-highlight-color:transparent] disabled:cursor-default disabled:opacity-40 motion-safe:active:not-disabled:scale-96',
  {
    variants: {
      tone: {
        default: 'border-line bg-raised text-ink hover:not-disabled:bg-raised-hover',
        primary:
          'border-accent-border bg-accent-soft font-semibold text-accent-strong hover:not-disabled:bg-accent-soft-hover',
        danger:
          'border-danger-border bg-danger-soft text-danger hover:not-disabled:bg-danger-soft-hover',
        quiet:
          'border-transparent bg-transparent text-muted hover:not-disabled:bg-hover hover:not-disabled:text-ink',
      },
      size: {
        default: 'px-3 py-1.25',
        small: 'px-2.75 py-1 text-small',
      },
    },
    compoundVariants: [{ tone: 'quiet', size: 'default', className: 'px-2 py-0.75 text-small' }],
    defaultVariants: { tone: 'default', size: 'default' },
  },
)

type Variants = VariantProps<typeof button>

interface Props extends ComponentProps<'button'> {
  /** Defaults to primary for a form's submit, and to a plain card otherwise. */
  tone?: Variants['tone']
  size?: Variants['size']
}

export function Button(props: Props) {
  const { tone, size, className, type = 'button', ...rest } = props
  return (
    <button
      {...rest}
      type={type}
      className={cn(
        button({ tone: tone ?? (type === 'submit' ? 'primary' : 'default'), size }),
        className,
      )}
    />
  )
}

export const iconButton = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-small p-1.5 transition-[background-color,color] duration-(--dur-feedback) [-webkit-tap-highlight-color:transparent] disabled:cursor-default disabled:opacity-40',
  {
    variants: {
      tone: {
        default: 'text-muted hover:not-disabled:bg-hover hover:not-disabled:text-ink',
        danger:
          'text-danger-muted hover:not-disabled:bg-danger-soft hover:not-disabled:text-danger',
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

interface IconButtonProps extends ComponentProps<'button'> {
  /** What the button does, read out and shown on hover in place of a visible label. */
  'aria-label': string
  /** Red for something that can't be undone, such as delete. */
  tone?: VariantProps<typeof iconButton>['tone']
}

/** A small quiet button with only an icon, such as delete or move up. */
export function IconButton(props: IconButtonProps) {
  const { tone, className, title, type = 'button', ...rest } = props
  return (
    <button
      {...rest}
      type={type}
      title={title ?? props['aria-label']}
      className={cn(iconButton({ tone }), className)}
    />
  )
}
