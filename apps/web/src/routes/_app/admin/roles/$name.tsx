import { createFileRoute } from '@tanstack/react-router'
import { RoleAdmin } from '../../../../features/admin/pages/RoleAdmin.tsx'
import { adminRolesQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/roles/$name')({
  loader: ({ context }) => context.queryClient.query(adminRolesQuery),
  component: Role,
})

function Role() {
  const { name } = Route.useParams()
  return <RoleAdmin name={name} />
}
