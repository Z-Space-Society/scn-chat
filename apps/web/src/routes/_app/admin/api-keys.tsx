import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysAdmin } from '../../../features/admin/pages/ApiKeysAdmin.tsx'
import { adminApiKeysQuery, adminRolesQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/api-keys')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminApiKeysQuery).then(noop, noop),
      context.queryClient.query(adminRolesQuery).then(noop, noop),
    ]),
  component: ApiKeysAdmin,
})
