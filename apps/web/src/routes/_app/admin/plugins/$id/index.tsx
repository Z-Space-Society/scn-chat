import { createFileRoute } from '@tanstack/react-router'
import { PluginAdmin } from '../../../../../features/admin/pages/PluginAdmin.tsx'
import { adminModelsQuery, adminPluginsQuery } from '../../../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/plugins/$id/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminPluginsQuery),
      context.queryClient.query(adminModelsQuery),
    ]),
  component: Plugin,
})

function Plugin() {
  const { id } = Route.useParams()
  return <PluginAdmin id={id} />
}
