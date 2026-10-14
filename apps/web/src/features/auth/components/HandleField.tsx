import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { SpinnerIcon } from '../../../shared/icons.tsx'
import { field } from '../../../shared/ui/controls.tsx'
import { floating, menuRow } from '../../../shared/ui/menu.ts'
import { Loading, Skeleton, SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { useDebounced } from '../../../shared/useDebounced.ts'
import { type AccountMatch, accountSearchQuery } from '../queries.ts'
import { Avatar } from './Avatar.tsx'

interface Props {
  id: string
  name: string
  /** Whether the server refused the last sign-in, which rings the field red. */
  invalid?: boolean
  /** The id of what describes the field, such as that refusal. */
  describedBy?: string
}

/** What to search for: the handle as typed without its @, or nothing for a DID or a PDS URL. */
const searchTerm = (value: string) => {
  const term = value.trim().replace(/^@/, '')
  return /[:/]/.test(term) ? '' : term
}

/** The floating panel under the field, settling in as the account menus do. */
const panel = cn(
  floating,
  'absolute inset-x-0 top-full z-10 mt-1 animate-panel-in motion-reduce:animate-none',
)

/** What the panel says when it has no accounts to offer. */
const note = 'px-2.25 py-1.25 text-muted text-small'

/** An account's row, a step tighter than a menu's, since its avatar and two lines already fill it. */
const row = cn(menuRow, 'px-2 py-1')

/**
 * The sign-in field for a handle or DID, which suggests accounts from Bluesky's typeahead as you
 * type. It follows the editable combobox pattern: focus stays in the field, the arrow keys move
 * through the suggestions, Enter or a click puts the handle in the field, and Escape closes them.
 * Enter with no suggestion picked submits the form as usual.
 */
export function HandleField(props: Props) {
  const listId = useId()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  /** The account picked, whose avatar stands in for the @ until the field is edited. */
  const [picked, setPicked] = useState<AccountMatch | null>(null)
  const typed = searchTerm(value)
  const term = useDebounced(typed, 150)
  // The last answer stays while the next loads, so the list doesn't flicker with each letter.
  const search = useQuery({
    ...accountSearchQuery(term),
    enabled: term !== '',
    placeholderData: keepPreviousData,
  })
  const matches = search.data ?? []
  // Typing counts as searching from the first key, before the pause that sends it.
  const waiting = typed !== term || search.isFetching
  // Loading shows only once a search has taken the theme's quiet wait, so a quick one never
  // flashes it.
  const slow = useDebounced(waiting, 400) && waiting
  const answered = search.data !== undefined || search.isError
  const panelShown = open && typed !== '' && (matches.length > 0 || answered || slow)
  const listShown = panelShown && matches.length > 0
  const optionId = (index: number) => `${listId}-${index}`

  const choose = (index: number) => {
    const match = matches[index]
    if (!match) return
    setValue(match.handle)
    setPicked(match)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (matches.length === 0 || typed === '') return
      event.preventDefault()
      if (!listShown) {
        setOpen(true)
        setActive(event.key === 'ArrowDown' ? 0 : matches.length - 1)
        return
      }
      // Moving past either end comes back to the field, with nothing picked.
      const by = event.key === 'ArrowDown' ? 1 : -1
      const next = active + by
      setActive(next < -1 ? matches.length - 1 : next >= matches.length ? -1 : next)
    } else if (event.key === 'Enter' && listShown && active >= 0) {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape' && panelShown) {
      event.preventDefault()
      setOpen(false)
    }
  }

  /** What the panel holds: the accounts found, or why there are none yet. */
  const contents = (): ReactNode => {
    if (listShown)
      return (
        <div id={listId} role="listbox" aria-label="Accounts" className="flex flex-col gap-0.5">
          {matches.map((match, i) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: the field owns the keyboard.
            // biome-ignore lint/a11y/useFocusableInteractive: options are reached through the field's aria-activedescendant.
            <div
              key={match.did}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              data-active={i === active || undefined}
              className={cn(row, 'cursor-pointer data-active:bg-row-hover')}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(i)}
            >
              <Avatar src={match.avatar ?? null} name={match.displayName || match.handle} />
              <span className="flex min-w-0 flex-col leading-[1.25]">
                {match.displayName && <span className="truncate">{match.displayName}</span>}
                <span
                  className={cn(
                    'truncate',
                    match.displayName && 'font-normal text-caption text-muted',
                  )}
                >
                  @{match.handle}
                </span>
              </span>
            </div>
          ))}
        </div>
      )
    if (slow)
      return (
        <Loading immediate label="Searching accounts" className="flex flex-col gap-0.5">
          {[0, 1, 2].map((line) => (
            <span key={line} className={row}>
              <Skeleton className="size-8 flex-none" />
              <span className="flex flex-1 flex-col leading-[1.25]">
                <SkeletonText className="w-28" />
                <SkeletonText className="w-36 text-caption" />
              </span>
            </span>
          ))}
        </Loading>
      )
    if (search.isError)
      return (
        <p role="status" className={note}>
          Couldn't search for accounts. You can still type your full handle.
        </p>
      )
    return (
      <p role="status" className={note}>
        No accounts found. You can still type your full handle.
      </p>
    )
  }

  return (
    <div className="relative">
      {picked ? (
        <Avatar
          // A new account's picture gets its own try at loading.
          key={picked.did}
          src={picked.avatar ?? null}
          name={picked.displayName || picked.handle}
          className="pointer-events-none absolute start-2.75 top-1/2 size-5 -translate-y-1/2 rounded-badge text-caption"
        />
      ) : (
        // The @ sits inside the field, since that's how people write a handle.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-3.25 top-1/2 -translate-y-1/2 text-muted"
        >
          @
        </span>
      )}
      <input
        id={props.id}
        name={props.name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setPicked(null)
          setOpen(true)
          // Typing starts with nothing picked, so Enter submits what was typed.
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        placeholder="alice.bsky.social"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={listShown}
        aria-controls={listShown ? listId : undefined}
        aria-activedescendant={listShown && active >= 0 ? optionId(active) : undefined}
        // The browser's own suggestions would cover the accounts found.
        autoComplete="off"
        // A handle is a domain name, which phone keyboards would otherwise capitalize and correct.
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        // biome-ignore lint/a11y/noAutofocus: signing in is all this page does.
        autoFocus
        required
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        className={cn(
          field,
          'h-10.5 w-full ps-7.5 pe-9 aria-invalid:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger-soft',
          picked && 'ps-9.5',
        )}
      />
      {/* A newer search on its way while the last one's accounts still show. */}
      {listShown && slow && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute end-3.25 top-1/2 flex -translate-y-1/2 animate-fade-in text-muted motion-reduce:animate-none"
        >
          <SpinnerIcon />
        </span>
      )}
      {/* How many accounts were found, for screen readers, which don't see the list appear. */}
      <span role="status" className="sr-only">
        {listShown &&
          !waiting &&
          `${matches.length} ${matches.length === 1 ? 'account' : 'accounts'} found`}
      </span>
      {/* One panel from loading to the accounts found, so it settles in only once. */}
      {panelShown && (
        // biome-ignore lint/a11y/noStaticElementInteractions: only keeps focus in the field.
        <div className={panel} onMouseDown={(event) => event.preventDefault()}>
          {contents()}
        </div>
      )}
    </div>
  )
}
