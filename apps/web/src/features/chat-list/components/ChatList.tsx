import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  lazy,
  type RefObject,
  Suspense,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { NewChatIcon, SearchIcon } from '../../../shared/icons.tsx'
import { sectionHeading, sidebarScroll } from '../../../shared/ui/sidebar.ts'
import { useDebounced } from '../../../shared/useDebounced.ts'
import type { ChatListItem } from '../../../store/core.ts'
import {
  useChatSearch,
  useConversations,
  useLatestReplies,
  useSyncIndex,
  useSyncStatus,
  useTags,
} from '../../../store/react.tsx'
import { AccountMenu } from '../../auth/components/AccountMenu.tsx'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { MeContext } from '../../auth/session.ts'
import { groupByDate } from '../lib/groups.ts'
import { markSeen, type Seen, useSeen } from '../lib/seen.ts'
import { ChatItem } from './ChatItem.tsx'
import { ChatRowsSkeleton, SearchSkeleton } from './ChatListSkeleton.tsx'
import { SyncDot, SyncPanel, useSyncNow } from './SyncStatus.tsx'
import { TagFilter } from './TagFilter.tsx'

/**
 * The search's results, which bring a Markdown parser for the replies' snippets, so they download
 * once the search opens rather than with every chat page.
 */
const loadSearchResults = () => import('./SearchResults.tsx')
const SearchResults = lazy(async () => ({ default: (await loadSearchResults()).SearchResults }))

/** Whether a chat has a finished reply the user hasn't seen on this device. */
const isUnseen = (chat: ChatListItem, seen: Seen | null, current: string | undefined) =>
  seen !== null &&
  chat.latestReply !== null &&
  chat.skey !== current &&
  seen[chat.skey] !== chat.latestReply

/**
 * The chat sidebar's contents: New chat and the search, the chats under their tags and dates or
 * what the search found, and the account at the foot. Only the chats scroll.
 */
export function ChatList() {
  const [tag, setTag] = useState<string | null>(null)
  const tags = useTags()
  // A tag the chats no longer carry stops filtering.
  const activeTag = tag && tags.some((t) => t.tag === tag) ? tag : null
  const list = useConversations(activeTag)
  const { conversations, isLoading, error: loadError } = list
  const status = useSyncStatus()
  // The chats are on their way until the local copy answers, or, when it has none yet, until the
  // chat index first syncs, as on a first sign-in.
  const loading = isLoading || (conversations.length === 0 && status?.syncedAt === null)
  const syncIndex = useSyncIndex()
  const navigate = useNavigate()
  const current = useParams({ strict: false, select: (params) => params.skey })
  // The box starts from the URL's `q`, and the settled search goes back into it.
  const q = useSearch({ strict: false, select: (search) => search.q })
  const [query, setQuery] = useState(q ?? '')
  // The search box shows once the search button opens it, and from the start when the URL has a
  // search.
  const [searchOpen, setSearchOpen] = useState(Boolean(q))
  const searchButton = useRef<HTMLButtonElement>(null)
  const typed = useDebounced(query, 150)
  useEffect(() => {
    if ((typed || undefined) === q) return
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, q: typed || undefined }),
      replace: true,
    })
  }, [typed, q, navigate])
  // Searching only begins after 2 characters are typed.
  const searching = typed.trim().length >= 2
  const found = useChatSearch(searching ? typed : '')
  const seen = useMarkSeen(current)
  // The next page loads as the end of the list nears, as it does when Tab moves focus down it.
  const scroll = useRef<HTMLDivElement>(null)
  const end = useLoadMore(scroll, list.hasNextPage && !list.isFetchingNextPage, list.fetchNextPage)

  // The same for every row, so a row rerenders only when its own chat changes.
  const changed = syncIndex
  const deleted = (skey: string) => {
    if (skey === current) void navigate({ to: '/' })
  }

  // Closing the search clears it, so the chats show again.
  const closeSearch = () => {
    setQuery('')
    setSearchOpen(false)
  }

  const signOut = useSignOut()
  const syncing = useSyncNow()
  const error = lastError(signOut) ?? loadError ?? (searching ? found.error : null)

  return (
    <>
      {/* New chat and the search button share a row, after Linear's. */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <button
          type="button"
          // The chat is created by its first message, on the page without an open chat.
          onClick={() => void navigate({ to: '/' })}
          className={cn(tool, 'min-w-0 flex-1 gap-2.25 px-row-inset font-semibold text-ink-strong')}
        >
          <NewChatIcon /> New chat
        </button>
        <button
          ref={searchButton}
          type="button"
          aria-label="Search chats"
          title="Search chats"
          aria-pressed={searchOpen}
          onClick={() => {
            if (searchOpen) return closeSearch()
            void loadSearchResults()
            setSearchOpen(true)
          }}
          className={cn(
            tool,
            'w-row flex-none justify-center text-muted aria-pressed:bg-row-active aria-pressed:text-ink',
          )}
        >
          <SearchIcon />
        </button>
      </div>
      {searchOpen && (
        // A row-sized, borderless field tinted into the frame, with a magnifier at its start.
        <label className="relative flex items-center">
          <SearchIcon className="pointer-events-none absolute start-row-inset top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            aria-label="Search chats"
            placeholder="Search"
            // biome-ignore lint/a11y/noAutofocus: the box only shows once the user opens it.
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              closeSearch()
              searchButton.current?.focus()
            }}
            className="h-row min-w-0 flex-1 rounded-row bg-row-hover ps-[calc(var(--spacing-row-inset)+--spacing(5.75))] pe-row-inset outline-none hover:bg-row-active focus-visible:bg-row-active"
          />
        </label>
      )}
      <ErrorAlert error={error} className="px-row-inset text-small" />
      {searching ? (
        <Suspense fallback={<SearchSkeleton />}>
          <SearchResults
            query={typed}
            results={found.results}
            remaining={found.remaining}
            loading={found.isLoading}
            onClear={() => {
              closeSearch()
              searchButton.current?.focus()
            }}
          />
        </Suspense>
      ) : (
        <div ref={scroll} className={sidebarScroll}>
          {/* At once, as it takes over from the frame's. */}
          {loading && <ChatRowsSkeleton heading immediate label="Loading chats" />}
          {tags.length > 0 && <TagFilter tags={tags} active={activeTag} onChange={setTag} />}
          <ChatRows
            conversations={conversations}
            seen={seen}
            current={current}
            onChanged={changed}
            onDeleted={deleted}
          />
          {/* Where the loaded chats end, which loads the next page as it nears view. */}
          {list.hasNextPage && <div ref={end} />}
          {list.isFetchingNextPage && <ChatRowsSkeleton rows={3} label="Loading more chats" />}
        </div>
      )}
      {/* Who is signed in, at the foot, with a dot on the avatar for how current the chats are. */}
      <footer className="relative flex items-center pt-1">
        <AccountMenu
          badge={<SyncDot syncing={syncing} />}
          status={<SyncPanel syncing={syncing} />}
          onSignOut={() => signOut.mutate()}
        />
      </footer>
    </>
  )
}

interface ChatRowsProps {
  conversations: ChatListItem[]
  seen: Seen | null
  /** The open chat's key, whose replies count as seen. */
  current: string | undefined
  onChanged: () => Promise<void>
  onDeleted: (skey: string) => void
}

/**
 * The loaded chats under their dates. Apart from the list, so typing a search or loading the next
 * page leaves them alone.
 */
function ChatRows(props: ChatRowsProps) {
  return (
    <>
      {groupByDate(props.conversations).map((group) => (
        <section key={group.label} aria-label={group.label} className="group/section">
          <h3 className={cn(sectionHeading, 'group-first/section:mt-0')}>{group.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((chat) => (
              <ChatItem
                key={chat.skey}
                chat={chat}
                unseen={isUnseen(chat, props.seen, props.current)}
                onChanged={props.onChanged}
                onDeleted={props.onDeleted}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

/** New chat and the search button: a faint tint, a step darker when hovered or pressed. */
const tool =
  'flex h-row cursor-pointer items-center rounded-row bg-row-hover hover:not-disabled:bg-row-active active:bg-row-active disabled:cursor-default disabled:opacity-40'

/**
 * What's seen on this device, kept as the chats change, from every chat's newest reply rather
 * than the rows loaded so far. The first answer seeds it, so older replies aren't all marked new.
 * After that, the open chat's newest reply counts as seen.
 */
function useMarkSeen(current: string | undefined): Seen | null {
  const did = useContext(MeContext)?.did ?? ''
  const seen = useSeen(did)
  const replies = useLatestReplies()
  const openReply = current ? replies?.[current] : undefined
  useEffect(() => {
    if (!did || !replies) return
    const chats = Object.keys(replies)
    if (chats.length === 0) return
    if (seen === null)
      markSeen(
        did,
        Object.fromEntries(
          Object.entries(replies).flatMap(([skey, reply]) => (reply ? [[skey, reply]] : [])),
        ),
      )
    else if (current && openReply && seen[current] !== openReply)
      markSeen(did, { [current]: openReply }, chats)
  }, [did, seen, replies, current, openReply])
  return seen
}

/**
 * Calls `onReach` when the end of a scrolling list comes within a few rows of view, while
 * `enabled`, by watching the element the returned ref is put on.
 */
function useLoadMore(
  scroll: RefObject<HTMLElement | null>,
  enabled: boolean,
  onReach: () => void,
): RefObject<HTMLDivElement | null> {
  const end = useRef<HTMLDivElement>(null)
  // Read when the end comes into view, so a new callback doesn't rebuild the observer.
  const reach = useEffectEvent(onReach)
  useEffect(() => {
    const target = end.current
    if (!enabled || !target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reach()
      },
      { root: scroll.current, rootMargin: '0px 0px 200px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [scroll, enabled])
  return end
}
