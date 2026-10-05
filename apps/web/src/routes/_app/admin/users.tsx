import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { validateUserSearch } from '../../../lib/search-params.ts'
import { UsersAdmin } from '../../../pages/admin/users.tsx'
import { adminInvitesQuery, adminRolesQuery, adminUsersQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/admin/users')({
  validateSearch: validateUserSearch,
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.infiniteQuery(adminUsersQuery(deps.q)).then(noop, noop),
      context.queryClient.query(adminInvitesQuery).then(noop, noop),
      context.queryClient.query(adminRolesQuery).then(noop, noop),
    ]),
  component: Users,
})

function Users() {
  const { q } = Route.useSearch()
  return <UsersAdmin q={q ?? ''} />
}
