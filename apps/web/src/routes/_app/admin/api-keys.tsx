import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysAdmin } from '../../../features/admin/pages/ApiKeysAdmin.tsx'
import { adminApiKeysQuery, adminRolesQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/api-keys')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminApiKeysQuery),
      context.queryClient.query(adminRolesQuery),
    ]),
  component: ApiKeysAdmin,
})
