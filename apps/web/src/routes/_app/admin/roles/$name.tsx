import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { RoleAdmin } from '../../../../features/admin/pages/RoleAdmin.tsx'
import { adminRolesQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/roles/$name')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminRolesQuery).then(noop, noop)]),
  component: Role,
})

function Role() {
  const { name } = Route.useParams()
  return <RoleAdmin name={name} />
}
