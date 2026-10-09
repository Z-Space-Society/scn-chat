import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { Invites } from '../components/Invites.tsx'
import { UserRow } from '../components/UserRow.tsx'
import { UserSearch } from '../components/UserSearch.tsx'
import { useUserActions } from '../hooks/useUserActions.ts'
import { roleNames } from '../lib/roles.ts'
import { adminRolesQuery, adminUsersQuery } from '../queries.ts'

interface UsersAdminProps {
  q: string
}

/** Accounts, with their roles and suspensions, and the people added who haven't signed in yet. */
export function UsersAdmin(props: UsersAdminProps) {
  return (
    <section>
      <h2>Users</h2>
      <Invites />
      <h3>Accounts</h3>
      <UserSearch q={props.q} />
      {/* Only the results wait for a new search, so the search box keeps its focus. */}
      <Suspense fallback={<p>Loading…</p>}>
        <UserTable q={props.q} />
      </Suspense>
    </section>
  )
}

interface UserTableProps {
  q: string
}

/** The accounts matching the search, a page at a time. */
function UserTable(props: UserTableProps) {
  const users = useSuspenseInfiniteQuery(adminUsersQuery(props.q))
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const actions = useUserActions()
  const assignable = roleNames(roles.roles)
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Handle</th>
            <th>DID</th>
            <th>Storage</th>
            <th>Roles</th>
            <th>Last active</th>
            <th>Add to role</th>
            <th>Access</th>
          </tr>
        </thead>
        <tbody>
          {users.data.pages
            .flatMap((page) => page.users)
            .map((user) => (
              <UserRow key={user.did} user={user} assignable={assignable} actions={actions} />
            ))}
        </tbody>
      </table>
      {users.hasNextPage && (
        <button type="button" onClick={() => void users.fetchNextPage()}>
          Load more
        </button>
      )}
      <ErrorAlert error={actions.error} />
    </>
  )
}
