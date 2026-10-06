import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { RolesAdmin } from '../../../../features/admin/pages/RolesAdmin.tsx'
import { adminRolesQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/roles/')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminRolesQuery).then(noop, noop)]),
  component: RolesAdmin,
})
