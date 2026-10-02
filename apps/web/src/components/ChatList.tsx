import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api, read } from '../api.ts'
import { useConversations, useSearch } from '../store/react.tsx'
import { SearchResults } from './SearchResults.tsx'
import { useAction } from './useAction.ts'
import { useDebounced } from './useDebounced.ts'
import { useSignOut } from './useSignOut.ts'

export function ChatList() {
  const { conversations, error: loadError } = useConversations()
  const [query, setQuery] = useState('')
  const typed = useDebounced(query, 150)
  // Searching only begins after 2 characters are types.
  const searching = typed.trim().length >= 2
  const found = useSearch(searching ? typed : '')
  const { error, run } = useAction()
  const signOut = useSignOut()
  const navigate = useNavigate()
  const create = async () => {
    const created = await read(api.chats.conversations.$post())
    await navigate({ to: '/chat/$skey', params: { skey: created.skey } })
  }
  return (
    <nav className="sidebar chat-list">
      <button type="button" onClick={() => run(create)}>
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
      <button type="button" onClick={() => run(signOut)}>
        Sign out
      </button>
    </nav>
  )
}
