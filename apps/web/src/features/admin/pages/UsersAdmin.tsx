import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { ItemList, ItemRowsSkeleton } from '../../../shared/ui/ItemList.tsx'
import {
  cardAlert,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
  undivided,
} from '../../../shared/ui/SettingsPage.tsx'
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
    <SettingsPage
      title="Users"
      description="Everyone with an account, and the people you've added who haven't signed in yet."
    >
      <Invites />
      <SettingsGroup title="Accounts">
        <UserSearch q={props.q} />
        {/* Only the results wait for a new search, so the search box keeps its focus. */}
        <Suspense fallback={<ItemRowsSkeleton initial className={undivided} />}>
          <UserList q={props.q} />
        </Suspense>
      </SettingsGroup>
    </SettingsPage>
  )
}

interface UserListProps {
  q: string
}

/** The accounts matching the search, a page at a time, read as the search's results. */
function UserList(props: UserListProps) {
  const users = useSuspenseInfiniteQuery(adminUsersQuery(props.q))
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const actions = useUserActions()
  const assignable = roleNames(roles.roles)
  const accounts = users.data.pages.flatMap((page) => page.users)
  return (
    <>
      {accounts.length === 0 && (
        <SettingsEmpty>
          {props.q ? `No one matches "${props.q}".` : 'No accounts yet.'}
        </SettingsEmpty>
      )}
      <ItemList aria-label="Accounts" className={undivided}>
        {accounts.map((user) => (
          <UserRow key={user.did} user={user} assignable={assignable} actions={actions} />
        ))}
      </ItemList>
      {users.hasNextPage && (
        <div className={`flex justify-center p-card-pad ${undivided}`}>
          <Button busy={users.isFetchingNextPage} onClick={() => void users.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
      <ErrorAlert error={actions.error} className={cardAlert} />
    </>
  )
}
