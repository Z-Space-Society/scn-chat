import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useContext, useEffect, useRef, useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { NewChatIcon, SearchIcon } from '../../../shared/icons.tsx'
import { sectionHeading, sidebarScroll } from '../../../shared/ui/sidebar.ts'
import { useDebounced } from '../../../shared/useDebounced.ts'
import type { ChatListItem } from '../../../store/core.ts'
import { useChatSearch, useConversations, useStore, useSyncStatus } from '../../../store/react.tsx'
import { AccountMenu } from '../../auth/components/AccountMenu.tsx'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { MeContext } from '../../auth/session.ts'
import { groupByDate } from '../lib/groups.ts'
import { markSeen, type Seen, useSeen } from '../lib/seen.ts'
import { ChatItem } from './ChatItem.tsx'
import { ChatRowsSkeleton } from './ChatListSkeleton.tsx'
import { SearchResults } from './SearchResults.tsx'
import { SyncDot, SyncPanel, useSyncNow } from './SyncStatus.tsx'
import { TagFilter } from './TagFilter.tsx'

/** Every tag on the user's chats, in order of first use, with how many chats carry it. */
function allTags(chats: ChatListItem[]) {
  const counts = new Map<string, number>()
  for (const tag of chats.flatMap((chat) => chat.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count }))
}

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
  const { conversations, isLoading, error: loadError } = useConversations()
  const status = useSyncStatus()
  // The chats are on their way until the local copy answers, or, when it has none yet, until the
  // chat index first syncs, as on a first sign-in.
  const loading = isLoading || (conversations.length === 0 && status?.syncedAt === null)
  const store = useStore()
  const navigate = useNavigate()
  const current = useParams({ strict: false, select: (params) => params.skey })
  // The box starts from the URL's `q`, and the settled search goes back into it.
  const q = useSearch({ strict: false, select: (search) => search.q })
  const [query, setQuery] = useState(q ?? '')
  // The search box shows once the search button opens it, and from the start when the URL has a
  // search.
  const [searchOpen, setSearchOpen] = useState(Boolean(q))
  const searchButton = useRef<HTMLButtonElement>(null)
  const [tag, setTag] = useState<string | null>(null)
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
  const seen = useMarkSeen(conversations, current)

  const tags = allTags(conversations)
  // A tag the chats no longer carry stops filtering.
  const activeTag = tag && tags.some((t) => t.tag === tag) ? tag : null
  const shown = activeTag
    ? conversations.filter((chat) => chat.tags.includes(activeTag))
    : conversations

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
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
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
      ) : (
        <div className={sidebarScroll}>
          {/* At once, as it takes over from the frame's. */}
          {loading && <ChatRowsSkeleton heading immediate label="Loading chats" />}
          {tags.length > 0 && <TagFilter tags={tags} active={activeTag} onChange={setTag} />}
          {groupByDate(shown).map((group) => (
            <section key={group.label} aria-label={group.label} className="group/section">
              <h3 className={cn(sectionHeading, 'group-first/section:mt-0')}>{group.label}</h3>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((chat) => (
                  <ChatItem
                    key={chat.skey}
                    chat={chat}
                    unseen={isUnseen(chat, seen, current)}
                    onChanged={() => store.worker.syncIndex()}
                    onDeleted={() => {
                      if (chat.skey === current) void navigate({ to: '/' })
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
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

/** New chat and the search button: a faint tint, a step darker when hovered or pressed. */
const tool =
  'flex h-row cursor-pointer items-center rounded-row bg-row-hover hover:not-disabled:bg-row-active active:bg-row-active disabled:cursor-default disabled:opacity-40'

/**
 * What's seen on this device, kept as the chats change. The first list seeds it, so older replies
 * aren't all marked new. After that, the open chat's newest reply counts as seen.
 */
function useMarkSeen(conversations: ChatListItem[], current: string | undefined): Seen | null {
  const did = useContext(MeContext)?.did ?? ''
  const seen = useSeen(did)
  const openReply = conversations.find((chat) => chat.skey === current)?.latestReply
  useEffect(() => {
    if (!did || conversations.length === 0) return
    if (seen === null)
      markSeen(
        did,
        Object.fromEntries(
          conversations.flatMap((chat) =>
            chat.latestReply ? [[chat.skey, chat.latestReply]] : [],
          ),
        ),
      )
    else if (current && openReply && seen[current] !== openReply)
      markSeen(
        did,
        { [current]: openReply },
        conversations.map((chat) => chat.skey),
      )
  }, [did, seen, conversations, current, openReply])
  return seen
}
