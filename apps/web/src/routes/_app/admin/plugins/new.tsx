import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { NewPluginAdmin } from '../../../../pages/admin/new-plugin.tsx'
import { adminInstalledQuery, adminPluginsQuery } from '../../../../queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/new')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminPluginsQuery).then(noop, noop),
      context.queryClient.query(adminInstalledQuery).then(noop, noop),
    ]),
  component: NewPluginAdmin,
})
