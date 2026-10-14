import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../cn.ts'
import { ChevronDownIcon } from '../icons.tsx'
import { usePlacement } from '../usePlacement.ts'
import { field } from './controls.tsx'
import { floating, menuRow } from './menu.ts'

export interface SelectOption {
  value: string
  label: string
  /** A quieter note beside the label in the list, such as what the option means. */
  detail?: string
  /** A small picture before the label, in the list and on the button when chosen. */
  icon?: ReactNode
  disabled?: boolean
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  'aria-label'?: string
  title?: string
  /** Classes for the button, such as its width. */
  className?: string
  /** Whether the button is quiet text rather than a field, as in the composer's toolbar. */
  quiet?: boolean
  disabled?: boolean
  /** A quiet title at the top of the open list, saying what the options choose. */
  heading?: string
  /** What the button says while no option holds the value, such as "Choose a model". */
  placeholder?: string
  /** What the button shows in place of the chosen option and its arrow, such as an icon. */
  children?: ReactNode
}

/** The list floats over the page by its button, with the rows of a floating menu. */
const listClass = cn(
  floating,
  'fixed z-50 flex max-h-64 max-w-[calc(100vw-(--spacing(2)))] flex-col gap-0.5 overflow-y-auto overscroll-contain text-ui',
)

const optionClass = cn(
  menuRow,
  'flex-none cursor-pointer whitespace-nowrap aria-disabled:cursor-default aria-disabled:text-faint aria-selected:font-semibold aria-selected:text-ink-strong data-active:bg-row-hover',
)

/** A quiet note at the far end of an option, such as what it means. */
const detailClass = 'ms-auto font-normal text-caption text-muted'

/** How long typed letters keep adding to one search, as in a native select. */
const TYPEAHEAD_MS = 600

/** The next enabled option from `from`, stepping by `by`, or `from` when there is none. */
const step = (options: SelectOption[], from: number, by: 1 | -1) => {
  for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i]?.disabled) return i
  return from
}
const first = (options: SelectOption[]) => step(options, -1, 1)
const last = (options: SelectOption[]) => step(options, options.length, -1)

/**
 * A choice among options: a button that opens a list of them. It follows the select-only combobox
 * pattern, so focus stays on the button and the arrow keys, Home, End, Enter, Space, Escape, and
 * typed letters work as in a native select. The list renders into the body, so no panel clips it,
 * and opens above the button when there is no room below.
 */
export function Select(props: Props) {
  const listId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const position = usePlacement(open, button, list)
  const typed = useRef({ text: '', at: 0 })
  const options = props.options
  const chosen = options.findIndex((option) => option.value === props.value)
  const optionId = (index: number) => `${listId}-${index}`

  /** Open the list on this option, or else the chosen one. */
  const show = (at?: number) => {
    setActive(at ?? (chosen >= 0 ? chosen : first(options)))
    setOpen(true)
  }
  const close = () => setOpen(false)
  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    close()
    if (option.value !== props.value) props.onChange(option.value)
  }

  /** Move to the next option starting with what was typed, as a native select does. */
  const search = (key: string) => {
    const now = Date.now()
    const text = now - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key : key
    typed.current = { text: text.toLowerCase(), at: now }
    const from = open ? active : chosen
    const order = options.map((_, i) => (from + 1 + i) % options.length)
    // A repeated letter steps through the options starting with it.
    const prefix = [...text].every((c) => c === text[0]) ? text[0] : text
    const match = order.find((i) => {
      const option = options[i]
      return option && !option.disabled && option.label.toLowerCase().startsWith(prefix ?? '')
    })
    if (match === undefined) return
    if (open) setActive(match)
    else show(match)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        show()
      } else if (event.key.length === 1) search(event.key)
      return
    }
    const moves: Record<string, () => number> = {
      ArrowDown: () => step(options, active, 1),
      ArrowUp: () => step(options, active, -1),
      Home: () => first(options),
      End: () => last(options),
      PageDown: () => last(options),
      PageUp: () => first(options),
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setActive(move())
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape') {
      // Only the list closes, not a panel the select sits in.
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') close()
    else if (event.key.length === 1) search(event.key)
  }

  const activeId = active >= 0 ? optionId(active) : undefined
  // Only when the active option changes, since the list re-renders as it scrolls, and scrolling
  // back to the active option then would undo the scroll.
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeId])

  const label = options[chosen]?.label ?? props.placeholder ?? ''
  return (
    <>
      <button
        ref={button}
        type="button"
        id={props.id}
        role="combobox"
        aria-label={props['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        title={props.title}
        disabled={props.disabled}
        data-quiet={props.quiet || undefined}
        className={cn(
          field,
          'inline-flex max-w-full cursor-pointer items-center justify-between gap-1.5 pe-2.25 text-start disabled:cursor-default aria-expanded:border-focus aria-expanded:ring-3 aria-expanded:ring-accent-soft',
          // Quiet, it reads as the toolbar's text until hovered or open.
          props.quiet &&
            'min-w-0 border-transparent bg-transparent px-2 py-1 font-medium text-muted-quiet hover:not-disabled:bg-hover hover:not-disabled:text-ink aria-expanded:border-transparent aria-expanded:text-ink aria-expanded:ring-0',
          props.className,
        )}
        // A click from the keyboard is handled by onKeyDown, which opens on Enter and Space.
        onClick={(event) => event.detail > 0 && (open ? close() : show())}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        {props.children ?? (
          <>
            {options[chosen]?.icon}
            <span className={cn('flex-1 truncate', chosen < 0 && 'text-muted')}>{label}</span>
            <ChevronDownIcon
              className={cn('size-3.25 text-muted', props.quiet && 'text-muted-quiet')}
            />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={props['aria-label']}
            className={listClass}
            style={position}
            // Keep focus on the button, which owns the keyboard while the list is open.
            onMouseDown={(event) => event.preventDefault()}
          >
            {/* The list's name already says this to screen readers, so it is only seen. */}
            {props.heading && (
              <div
                className="px-2.25 py-0.75 font-medium text-caption text-muted leading-[1.4]"
                aria-hidden
              >
                {props.heading}
              </div>
            )}
            {options.map((option, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the button owns the keyboard.
              // biome-ignore lint/a11y/useFocusableInteractive: options are reached through the button's aria-activedescendant.
              <div
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-selected={i === chosen}
                aria-disabled={option.disabled || undefined}
                data-active={i === active || undefined}
                className={optionClass}
                onMouseMove={() => !option.disabled && setActive(i)}
                onClick={() => choose(i)}
              >
                {option.icon}
                <span className="min-w-0 truncate">{option.label}</span>
                {option.detail && <span className={cn(detailClass, 'ps-6')}>{option.detail}</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
