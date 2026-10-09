import { createFileRoute } from '@tanstack/react-router'
import { AccessAdmin } from '../../../features/admin/pages/AccessAdmin.tsx'
import { adminAccessQuery, adminRolesQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/access')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminAccessQuery),
      context.queryClient.query(adminRolesQuery),
    ]),
  component: AccessAdmin,
})
