import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api, read } from '../../../shared/api.ts'
import { lastError } from '../../../shared/errors.ts'
import { useDebounced } from '../../../shared/useDebounced.ts'
import { useChatSearch, useConversations } from '../../../store/react.tsx'
import { useSignOut } from '../../auth/hooks/useSignOut.ts'
import { SearchResults } from './SearchResults.tsx'

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
  // Searching only begins after 2 characters are types.
  const searching = typed.trim().length >= 2
  const found = useChatSearch(searching ? typed : '')
  const create = useMutation({
    mutationFn: async () => {
      const created = await read(api.chats.conversations.$post())
      await navigate({ to: '/chat/$skey', params: { skey: created.skey } })
    },
  })
  const signOut = useSignOut()
  const error = lastError(create, signOut)
  return (
    <nav className="sidebar chat-list">
      <button type="button" onClick={() => create.mutate()}>
        New chat
      </button>
      <input
        type="search"
        aria-label="Search chats"
        placeholder="Search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {(error ?? loadError ?? (searching && found.error)) && (
        <p role="alert">{error ?? loadError ?? found.error}</p>
      )}
      {searching ? (
        <SearchResults results={found.results} remaining={found.remaining} />
      ) : (
        <ul>
          {conversations.map((c) => (
            <li key={c.skey}>
              <Link to="/chat/$skey" params={{ skey: c.skey }}>
                {c.title || 'New chat'}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/settings">Settings</Link>
      <button type="button" onClick={() => signOut.mutate()}>
        Sign out
      </button>
    </nav>
  )
}
