import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useDebounced } from '../../../shared/useDebounced.ts'
import type { ConversationSummary } from '../../../store/core.ts'
import { useChatSearch, useConversations } from '../../../store/react.tsx'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { SearchResults } from './SearchResults.tsx'

/** The chat sidebar's contents: new chat, search, the chats or what the search found, and account links. */
export function ChatList() {
  const { conversations, error: loadError } = useConversations()
  const navigate = useNavigate()
  // The box starts from the URL's `q`, and the settled search goes back into it.
  const q = useSearch({ strict: false, select: (search) => search.q })
  const [query, setQuery] = useState(q ?? '')
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
  const create = useMutation({
    mutationFn: () => read(api.chats.conversations.$post()),
    onSuccess: (created) => navigate({ to: '/chat/$skey', params: { skey: created.skey } }),
  })
  const signOut = useSignOut()
  const error = lastError(create, signOut) ?? loadError ?? (searching ? found.error : null)
  return (
    <>
      <button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
        New chat
      </button>
      <input
        type="search"
        aria-label="Search chats"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ErrorAlert error={error} />
      {searching ? (
        <SearchResults results={found.results} remaining={found.remaining} />
      ) : (
        <ConversationLinks conversations={conversations} />
      )}
      <Link to="/settings">Settings</Link>
      <button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        Sign out
      </button>
    </>
  )
}

interface ConversationLinksProps {
  conversations: ConversationSummary[]
}

/** A link to each chat, most recently updated first. */
function ConversationLinks(props: ConversationLinksProps) {
  return (
    <ul>
      {props.conversations.map((c) => (
        <li key={c.skey}>
          <Link to="/chat/$skey" params={{ skey: c.skey }}>
            {c.title || 'New chat'}
          </Link>
        </li>
      ))}
    </ul>
  )
}
