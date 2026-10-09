import { createFileRoute } from '@tanstack/react-router'
import { UsersAdmin } from '../../../features/admin/pages/UsersAdmin.tsx'
import {
  adminInvitesQuery,
  adminRolesQuery,
  adminUsersQuery,
} from '../../../features/admin/queries.ts'
import { validateUserSearch } from '../../../shared/search-params.ts'

export const Route = createFileRoute('/_app/admin/users')({
  validateSearch: validateUserSearch,
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.infiniteQuery(adminUsersQuery(deps.q)),
      context.queryClient.query(adminInvitesQuery),
      context.queryClient.query(adminRolesQuery),
    ]),
  // A search keeps showing the current results until the new ones load, rather than the pending
  // component, which would take the search box and its focus with it.
  pendingMs: Number.POSITIVE_INFINITY,
  component: Users,
})

function Users() {
  const { q } = Route.useSearch()
  return <UsersAdmin q={q ?? ''} />
}
