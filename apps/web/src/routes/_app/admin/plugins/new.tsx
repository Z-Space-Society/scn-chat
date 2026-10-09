import { createFileRoute } from '@tanstack/react-router'
import { NewPluginAdmin } from '../../../../features/admin/pages/NewPluginAdmin.tsx'
import { adminInstalledQuery, adminPluginsQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/new')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminPluginsQuery),
      context.queryClient.query(adminInstalledQuery),
    ]),
  component: NewPluginAdmin,
})
