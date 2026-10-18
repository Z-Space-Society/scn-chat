import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../cn.ts'
import { ChevronDownIcon } from '../icons.tsx'
import { touchOnly } from '../touch.ts'
import { useDismiss } from '../useDismiss.ts'
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
  /** Text a search matches besides the label, such as a model's ID. */
  keywords?: string
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
  /**
   * The name and placeholder of a search box at the top of the open list, such as "Search
   * models", which it offers once it holds more options than it shows without scrolling.
   */
  searchLabel?: string
}

/**
 * The list floats over the page by its button, with the rows of a floating menu. Only the options
 * scroll, under the heading and search box. It shows about seven options before it scrolls.
 */
const popupClass = cn(
  floating,
  'fixed z-50 flex max-h-64 max-w-[calc(100vw-(--spacing(2)))] flex-col text-ui',
)
const listClass = 'flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain'

/** The options a list holds before it offers a search, about as many as it shows unscrolled. */
const SEARCH_FROM = 8

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

/** Whether a key comes with a modifier, which leaves it to the browser. */
const modified = (event: KeyboardEvent) => event.altKey || event.ctrlKey || event.metaKey

/** The options holding every word of the query in their label or keywords, in any case. */
const filter = (options: SelectOption[], query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return options.filter((option) => {
    const text = `${option.label} ${option.keywords ?? ''}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

/**
 * A choice among options: a button that opens a list of them. It follows the select-only combobox
 * pattern, so focus stays on the button and the arrow keys, Home, End, Enter, Space, Escape, and
 * typed letters work as in a native select. The list renders into the body, so no panel clips it,
 * and opens above the button when there is no room below. With `searchLabel` and a long list, the
 * open list starts with a search box that takes the focus and the keyboard instead, except on a
 * touch screen, where it waits for a tap so the on-screen keyboard doesn't cover the list, and a
 * letter typed on the closed button opens the list searching for it.
 */
export function Select(props: Props) {
  const listId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const searchBox = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [query, setQuery] = useState('')
  const position = usePlacement(open, button, popup)
  const typed = useRef({ text: '', at: 0 })
  const searchable = props.searchLabel !== undefined && props.options.length >= SEARCH_FROM
  // The options on show, which a search narrows. `active` and `chosen` index them.
  const options = query ? filter(props.options, query) : props.options
  const chosen = options.findIndex((option) => option.value === props.value)
  // By its place among every option, so an option keeps its id as a search narrows the list, and
  // moving to another option always changes the active id that screen readers follow.
  const optionId = (option: SelectOption) => `${listId}-${props.options.indexOf(option)}`

  /** Open the list on this option, or else the chosen one. */
  const show = (at?: number) => {
    setActive(at ?? (chosen >= 0 ? chosen : first(options)))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  /** Search for this text, on the first option that matches it. */
  const searchFor = (text: string) => {
    setQuery(text)
    setActive(first(filter(props.options, text)))
    setOpen(true)
  }
  /** Close the list, with the focus back on the button when the search box holds it. */
  const closeToButton = () => {
    if (document.activeElement === searchBox.current) button.current?.focus()
    close()
  }
  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    closeToButton()
    if (option.value !== props.value) props.onChange(option.value)
  }
  // A press outside closes it even when the button never held the focus, as Safari doesn't focus a
  // clicked button, so no blur would.
  useDismiss(open, [button, popup], close)
  /** Close when the focus leaves for anywhere but the button or the search box. */
  const onBlur = (event: FocusEvent) => {
    const to = event.relatedTarget
    if (to !== button.current && to !== searchBox.current) close()
  }

  /** Move to the next option starting with what was typed, as a native select does. */
  const jump = (key: string) => {
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

  const moves: Record<string, () => number> = {
    ArrowDown: () => step(options, active, 1),
    ArrowUp: () => step(options, active, -1),
    Home: () => first(options),
    End: () => last(options),
    PageDown: () => last(options),
    PageUp: () => first(options),
  }

  /**
   * Handle a key of the open list, from the button or the search box: the moves, Enter, Escape,
   * and Tab. Whether the key was one of them.
   */
  const handleListKey = (event: KeyboardEvent) => {
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setActive(move())
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape') {
      // Only the list closes, not a panel the select sits in.
      event.preventDefault()
      event.stopPropagation()
      closeToButton()
    } else if (event.key === 'Tab') {
      // From the search box, Tab goes on from the button, as it would from a native select.
      closeToButton()
    } else return false
    return true
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (modified(event)) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        show()
      } else if (event.key.length === 1) {
        if (!searchable) jump(event.key)
        else if (event.key !== ' ') {
          // The letter goes into the search box rather than the button's own keypress.
          event.preventDefault()
          searchFor(event.key)
        }
      }
      return
    }
    if (handleListKey(event)) return
    if (event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key.length === 1) jump(event.key)
  }

  /** In the search box, Home, End, and every letter stay the field's own. */
  const onSearchKeyDown = (event: KeyboardEvent) => {
    if (modified(event) || event.key === 'Home' || event.key === 'End') return
    handleListKey(event)
  }

  const activeOption = options[active]
  const activeId = activeOption ? optionId(activeOption) : undefined
  // Only when the active option changes, since the list re-renders as it scrolls, and scrolling
  // back to the active option then would undo the scroll.
  useEffect(() => {
    if (open && activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, activeId])
  // The search box takes the focus as the list opens, but on a touch screen only when tapped, since
  // its keyboard would cover the list.
  useEffect(() => {
    if (open && searchable && !touchOnly()) searchBox.current?.focus()
  }, [open, searchable])

  const current = props.options.find((option) => option.value === props.value)
  const label = current?.label ?? props.placeholder ?? ''
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
        aria-activedescendant={open && !searchable ? activeId : undefined}
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
        onBlur={onBlur}
      >
        {props.children ?? (
          <>
            {current?.icon}
            <span className={cn('flex-1 truncate', !current && 'text-muted')}>{label}</span>
            <ChevronDownIcon
              className={cn('size-3.25 text-muted', props.quiet && 'text-muted-quiet')}
            />
          </>
        )}
      </button>
      {open &&
        createPortal(
          // biome-ignore lint/a11y/noStaticElementInteractions: it only keeps the focus where it is.
          <div
            ref={popup}
            className={popupClass}
            style={position}
            // Keep focus on the button or the search box, which own the keyboard while the list is
            // open.
            onMouseDown={(event) => event.target !== searchBox.current && event.preventDefault()}
          >
            {/* The list's name already says this to screen readers, so it is only seen. */}
            {props.heading && (
              <div
                className="mb-0.5 flex-none px-2.25 py-0.75 font-medium text-caption text-muted leading-[1.4]"
                aria-hidden
              >
                {props.heading}
              </div>
            )}
            {searchable && (
              <>
                <input
                  ref={searchBox}
                  type="text"
                  role="combobox"
                  aria-label={props.searchLabel}
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId}
                  placeholder={props.searchLabel}
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => searchFor(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  onBlur={onBlur}
                  className={cn(field, 'mb-0.5 w-full min-w-48 flex-none py-1')}
                />
                {/* Shown even while empty, though it takes no room then, so screen readers hear it
                    once nothing matches. */}
                <p role="status" className="flex-none">
                  {options.length === 0 && (
                    <span className={cn(menuRow, 'font-normal text-muted')}>No matches</span>
                  )}
                </p>
              </>
            )}
            <div id={listId} role="listbox" aria-label={props['aria-label']} className={listClass}>
              {options.map((option, i) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the button owns the keyboard.
                // biome-ignore lint/a11y/useFocusableInteractive: options are reached through the aria-activedescendant of the button or search box.
                <div
                  key={option.value}
                  id={optionId(option)}
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
                  {option.detail && (
                    <span className={cn(detailClass, 'ps-6')}>{option.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
