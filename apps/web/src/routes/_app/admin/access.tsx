import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { AccessAdmin } from '../../../features/admin/pages/AccessAdmin.tsx'
import { adminAccessQuery, adminRolesQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/access')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminAccessQuery).then(noop, noop),
      context.queryClient.query(adminRolesQuery).then(noop, noop),
    ]),
  component: AccessAdmin,
})
