import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

interface Props {
  q: string
}

/** The search box, which follows the URL's `q` when it changes, as when the sidebar link clears it. */
export function UserSearch(props: Props) {
  const navigate = useNavigate()
  const [search, setSearch] = useState(props.q)
  // Updated while rendering rather than by remounting, so the box keeps focus after a search.
  const [shownQ, setShownQ] = useState(props.q)
  if (props.q !== shownQ) {
    setShownQ(props.q)
    setSearch(props.q)
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = search.trim()
        void navigate({
          to: '/admin/users',
          search: trimmed ? { q: trimmed } : {},
          replace: true,
        })
      }}
    >
      <input
        aria-label="Search users"
        placeholder="Handle or DID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <button type="submit">Search</button>
    </form>
  )
}
