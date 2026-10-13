import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '../../../shared/cn.ts'
import { Button } from '../../../shared/ui/Button.tsx'
import { field } from '../../../shared/ui/controls.tsx'
import { inlineForm } from '../../../shared/ui/SettingsPage.tsx'

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
      // The results follow with no line between, so they read as the search's.
      className={cn(inlineForm, 'pb-0')}
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
        type="search"
        aria-label="Search users"
        placeholder="Search by handle or DID"
        className={field}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Button type="submit">Search</Button>
    </form>
  )
}
