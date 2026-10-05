import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PluginAdmin } from '../../../../pages/admin/plugin.tsx'
import { adminModelsQuery, adminPluginsQuery, adminRolesQuery } from '../../../../queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/$id')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminPluginsQuery).then(noop, noop),
      context.queryClient.query(adminModelsQuery).then(noop, noop),
      context.queryClient.query(adminRolesQuery).then(noop, noop),
    ]),
  component: Plugin,
})

function Plugin() {
  const { id } = Route.useParams()
  return <PluginAdmin id={id} />
}
