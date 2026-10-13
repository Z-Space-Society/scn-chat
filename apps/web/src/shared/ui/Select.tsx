import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../cn.ts'
import { ChevronDownIcon, ChevronRightIcon } from '../icons.tsx'
import { usePlacement, useSidePlacement } from '../usePlacement.ts'
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

/** A further choice with its own value, in a list of its own opened from a row after a select's options. */
export interface SelectSubmenu {
  /** What the row says it chooses, such as "Thinking effort". It also names the list. */
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
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
  /**
   * A further choice, so one button sets two values: a row after the options, naming it and what
   * is chosen, that opens its options in a list beside this one.
   */
  submenu?: SelectSubmenu
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
 * and opens above the button when there is no room below. A submenu opens beside the list from its
 * row, on hover, on a click, or with the arrow key toward it, and closes with the one away from it.
 */
export function Select(props: Props) {
  const listId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const row = useRef<HTMLDivElement>(null)
  const side = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // The submenu's active option while it is open, or -1 for none yet; null while it is closed.
  const [subActive, setSubActive] = useState<number | null>(null)
  const position = usePlacement(open, button, list)
  const sidePosition = useSidePlacement(subActive !== null, row, side)
  const typed = useRef({ text: '', at: 0 })
  const submenu = props.submenu
  // The submenu's row follows the options, and the keys move to it as to one more option.
  const rowIndex = submenu ? props.options.length : -1
  const rows: SelectOption[] = submenu
    ? [...props.options, { value: '', label: submenu.label }]
    : props.options
  const chosen = props.options.findIndex((option) => option.value === props.value)
  const subChosen = submenu?.options.findIndex((option) => option.value === submenu.value) ?? -1
  const optionId = (index: number) => `${listId}-${index}`
  const subOptionId = (index: number) => `${listId}-sub-${index}`

  /** Open the list on this option, or else the chosen one. */
  const show = (at?: number) => {
    setActive(at ?? (chosen >= 0 ? chosen : first(rows)))
    setSubActive(null)
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setSubActive(null)
  }
  /** Open the submenu on its chosen option, or else its first. */
  const showSubmenu = () => {
    if (!submenu) return
    setActive(rowIndex)
    setSubActive(subChosen >= 0 ? subChosen : first(submenu.options))
  }
  const choose = (index: number) => {
    if (index === rowIndex) return showSubmenu()
    const option = props.options[index]
    if (!option || option.disabled) return
    close()
    if (option.value !== props.value) props.onChange(option.value)
  }
  const chooseSub = (index: number) => {
    const option = submenu?.options[index]
    if (!submenu || !option || option.disabled) return
    close()
    if (option.value !== submenu.value) submenu.onChange(option.value)
  }

  /** Move to the next option starting with what was typed, as a native select does. */
  const search = (key: string) => {
    const now = Date.now()
    const text = now - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key : key
    typed.current = { text: text.toLowerCase(), at: now }
    const inSubmenu = submenu && subActive !== null
    const options = inSubmenu ? submenu.options : rows
    const from = inSubmenu ? subActive : open ? active : chosen
    const order = options.map((_, i) => (from + 1 + i) % options.length)
    // A repeated letter steps through the options starting with it.
    const prefix = [...text].every((c) => c === text[0]) ? text[0] : text
    const match = order.find((i) => {
      const option = options[i]
      return option && !option.disabled && option.label.toLowerCase().startsWith(prefix ?? '')
    })
    if (match === undefined) return
    if (inSubmenu) setSubActive(match)
    else if (open) setActive(match)
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
    // The submenu opens toward the end of the line, so its arrow keys follow the reading direction.
    const rtl = button.current && getComputedStyle(button.current).direction === 'rtl'
    const into = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (submenu && subActive !== null) {
      const options = submenu.options
      const moves: Record<string, () => number> = {
        ArrowDown: () => step(options, subActive, 1),
        ArrowUp: () => (subActive < 0 ? last(options) : step(options, subActive, -1)),
        Home: () => first(options),
        End: () => last(options),
        PageDown: () => last(options),
        PageUp: () => first(options),
      }
      const move = moves[event.key]
      if (move) {
        event.preventDefault()
        setSubActive(move())
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        chooseSub(subActive)
      } else if (event.key === 'Escape' || event.key === back) {
        // Only the submenu closes, back to its row in the list.
        event.preventDefault()
        event.stopPropagation()
        setSubActive(null)
      } else if (event.key === 'Tab') close()
      else if (event.key.length === 1) search(event.key)
      return
    }
    const moves: Record<string, () => number> = {
      ArrowDown: () => step(rows, active, 1),
      ArrowUp: () => step(rows, active, -1),
      Home: () => first(rows),
      End: () => last(rows),
      PageDown: () => last(rows),
      PageUp: () => first(rows),
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setActive(move())
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key === into && active === rowIndex) {
      event.preventDefault()
      showSubmenu()
    } else if (event.key === 'Escape') {
      // Only the list closes, not a panel the select sits in.
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') close()
    else if (event.key.length === 1) search(event.key)
  }

  const activeId =
    subActive !== null && subActive >= 0
      ? subOptionId(subActive)
      : active >= 0
        ? optionId(active)
        : undefined
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  })

  /** One option as a row of a list. */
  const optionRow = (
    option: SelectOption,
    id: string,
    selected: boolean,
    isActive: boolean,
    onMove: () => void,
    onClick: () => void,
  ) => (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the button owns the keyboard.
    // biome-ignore lint/a11y/useFocusableInteractive: options are reached through the button's aria-activedescendant.
    <div
      key={option.value}
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      data-active={isActive || undefined}
      className={optionClass}
      onMouseMove={() => !option.disabled && onMove()}
      onClick={onClick}
    >
      {option.icon}
      <span className="min-w-0 truncate">{option.label}</span>
      {option.detail && <span className={cn(detailClass, 'ps-6')}>{option.detail}</span>}
    </div>
  )

  const label = props.options[chosen]?.label ?? props.placeholder ?? ''
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
            {props.options[chosen]?.icon}
            <span className={cn('flex-1 truncate', chosen < 0 && 'text-muted')}>{label}</span>
            <ChevronDownIcon
              className={cn('size-3.25 text-muted', props.quiet && 'text-muted-quiet')}
            />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <>
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
              {props.options.map((option, i) =>
                optionRow(
                  option,
                  optionId(i),
                  i === chosen,
                  i === active,
                  () => {
                    setActive(i)
                    setSubActive(null)
                  },
                  () => choose(i),
                ),
              )}
              {submenu && (
                // biome-ignore lint/a11y/useSemanticElements: a listbox holds groups of options, not fieldsets.
                <div role="group" className="flex flex-col">
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: the button owns the keyboard. */}
                  {/* biome-ignore lint/a11y/useFocusableInteractive: reached through the button's aria-activedescendant. */}
                  <div
                    ref={row}
                    id={optionId(rowIndex)}
                    role="option"
                    aria-selected={false}
                    className={optionClass}
                    data-active={active === rowIndex || undefined}
                    onMouseMove={() => {
                      setActive(rowIndex)
                      if (subActive === null) setSubActive(-1)
                    }}
                    onClick={showSubmenu}
                  >
                    <span className="min-w-0 truncate">{submenu.label}</span>
                    <span className={cn(detailClass, 'ps-4')}>
                      {submenu.options[subChosen]?.label}
                    </span>
                    <ChevronRightIcon className="-ms-0.75 size-3.25 text-muted" />
                  </div>
                </div>
              )}
            </div>
            {submenu && subActive !== null && (
              <div
                ref={side}
                role="listbox"
                aria-label={submenu.label}
                className={listClass}
                style={sidePosition}
                onMouseDown={(event) => event.preventDefault()}
              >
                {submenu.options.map((option, i) =>
                  optionRow(
                    option,
                    subOptionId(i),
                    i === subChosen,
                    i === subActive,
                    () => setSubActive(i),
                    () => chooseSub(i),
                  ),
                )}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  )
}
