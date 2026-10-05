import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PluginsAdmin } from '../../../../features/admin/pages/PluginsAdmin.tsx'
import { adminPluginsQuery } from '../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminPluginsQuery).then(noop, noop)]),
  component: PluginsAdmin,
})
