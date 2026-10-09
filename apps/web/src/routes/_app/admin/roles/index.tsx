import { createFileRoute } from '@tanstack/react-router'
import { RolesAdmin } from '../../../../features/admin/pages/RolesAdmin.tsx'
import { adminRolesQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/roles/')({
  loader: ({ context }) => context.queryClient.query(adminRolesQuery),
  component: RolesAdmin,
})
