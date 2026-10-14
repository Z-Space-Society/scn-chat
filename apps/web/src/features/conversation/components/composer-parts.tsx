import type { ComponentProps, FormEvent, ReactNode } from 'react'
import { cn } from '../../../shared/cn.ts'
import { CloseIcon, PaperclipIcon, SendIcon, StopIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { field } from '../../../shared/ui/controls.tsx'

/*
 * The composer's parts, which the composer and its frame, standing in for it while the page's code
 * loads, are both built from, so one becomes the other without moving.
 */

/** What the empty box says: nothing until it's known whether the message starts the chat. */
export function messagePlaceholder(state: { parent?: string; waiting?: boolean }) {
  if (state.waiting) return ''
  return state.parent ? 'Reply' : 'Ask anything'
}

interface DockProps {
  /** Send the message. The frame has nothing to send, so it is a plain box. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  children: ReactNode
}

const dock =
  'group/composer sticky bottom-0 isolate mt-auto pt-6 pb-4.5 before:absolute before:-inset-x-gutter before:inset-y-0 before:-z-1 before:bg-panel before:[mask-image:linear-gradient(transparent,black_--spacing(6))]'

/** The composer floating at the bottom of the panel, over the conversation fading under it. */
export function ComposerDock(props: DockProps) {
  if (!props.onSubmit) return <div className={dock}>{props.children}</div>
  return (
    <form onSubmit={props.onSubmit} className={dock}>
      {props.children}
    </form>
  )
}

interface ChildrenProps {
  children: ReactNode
}

/**
 * The card holding the box's parts, the first of which takes its top corners. While Clear shows,
 * that part keeps room for it.
 */
export function ComposerCard(props: ChildrenProps) {
  return (
    <div className="relative [&>:first-child]:rounded-t-composer [&>:first-child]:border-t has-[>[data-clear]]:[&>:first-child]:pe-[calc(var(--spacing-composer-button)+--spacing(3.5))]">
      {props.children}
    </div>
  )
}

/**
 * A part of the card, for a part that draws itself, such as the attachments. Only the box's edge
 * firms while it is being typed in.
 */
export const composerPart =
  'border-x border-line bg-raised group-focus-within/composer:border-line-strong in-data-dropping:border-dashed in-data-dropping:border-accent'

/**
 * The message box. Each paragraph runs in the direction of its own text, while the box keeps the
 * page's, so Clear's room stays on Clear's side in right-to-left text too.
 */
export function MessageBox(props: ComponentProps<'textarea'>) {
  return (
    <textarea
      aria-label="Message"
      {...props}
      className={cn(
        field,
        composerPart,
        'block max-h-composer-max min-h-13.5 w-full resize-none rounded-none border-y-0 px-4.5 pt-3.5 pb-1.5 text-[max(var(--input-floor),var(--text-body))] text-ink-strong [field-sizing:content] [unicode-bidi:plaintext] focus-visible:border-line-strong focus-visible:ring-0',
      )}
    />
  )
}

/** The toolbar along the card's foot: Attach, the model and effort, and Send. */
export function ComposerToolbar(props: ChildrenProps) {
  return (
    <div
      className={cn(
        composerPart,
        'flex flex-wrap items-center gap-1.75 rounded-b-composer border-b ps-3.25 pe-2.25 pt-1.75 pb-2.25 text-small',
      )}
    >
      {props.children}
    </div>
  )
}

/** A round button at the toolbar's end or start, nesting in the composer's corner. */
const round = 'inline-grid size-composer-button flex-none place-items-center rounded-full p-0'

interface AttachProps {
  title?: string
  onClick?: () => void
  disabled?: boolean
}

/** Attach, at the toolbar's start, which opens the file picker. */
export function AttachButton(props: AttachProps) {
  return (
    <button
      type="button"
      aria-label="Attach files"
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      className={cn(
        round,
        '-ms-1.5 me-auto cursor-pointer text-faint hover:bg-hover hover:text-ink',
      )}
    >
      <PaperclipIcon />
    </button>
  )
}

interface SendProps {
  title?: string
  disabled: boolean
}

/** Send, the main action, in the card's corner. */
export function SendButton(props: SendProps) {
  return (
    <Button
      type="submit"
      aria-label="Send"
      title={props.title}
      disabled={props.disabled}
      className={round}
    >
      <SendIcon className="size-4.75" />
    </Button>
  )
}

interface StopProps {
  onClick: () => void
}

/** Stop, in Send's place while the reply at the end of the branch runs. */
export function StopButton(props: StopProps) {
  return (
    <Button
      tone="danger"
      aria-label="Stop"
      title="Stop the reply"
      onClick={props.onClick}
      className={round}
    >
      {/* The stop square fills most of its box, so it draws smaller to sit at the arrow's weight. */}
      <StopIcon className="size-3.25" />
    </Button>
  )
}

interface ClearProps {
  disabled: boolean
  onClick: () => void
}

/**
 * Clear, in the box's top corner as a field's own clear button, apart from the toolbar's
 * controls. It sits in the card, which keeps room for it.
 */
export function ClearButton(props: ClearProps) {
  return (
    <button
      type="button"
      data-clear
      aria-label="Clear"
      title="Clear the message"
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        round,
        'absolute end-2.5 top-2.5 cursor-pointer text-faint hover:not-disabled:bg-hover hover:not-disabled:text-ink',
      )}
    >
      <CloseIcon />
    </button>
  )
}
