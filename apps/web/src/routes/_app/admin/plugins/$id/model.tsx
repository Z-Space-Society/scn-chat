import { createFileRoute } from '@tanstack/react-router'
import { ModelAdmin } from '../../../../../features/admin/pages/ModelAdmin.tsx'
import { adminModelsQuery, adminRolesQuery } from '../../../../../features/admin/queries.ts'
import { validateModelSearch } from '../../../../../shared/search-params.ts'

export const Route = createFileRoute('/_app/admin/plugins/$id/model')({
  validateSearch: validateModelSearch,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminModelsQuery),
      context.queryClient.query(adminRolesQuery),
    ]),
  component: Model,
})

function Model() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return <ModelAdmin pluginId={id} provider={search.provider} modelId={search.id} />
}
