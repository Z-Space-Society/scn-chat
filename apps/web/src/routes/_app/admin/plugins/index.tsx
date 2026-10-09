import { createFileRoute } from '@tanstack/react-router'
import { PluginsAdmin } from '../../../../features/admin/pages/PluginsAdmin.tsx'
import { adminPluginsQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/')({
  loader: ({ context }) => context.queryClient.query(adminPluginsQuery),
  component: PluginsAdmin,
})
