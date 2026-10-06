import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ModelAdmin } from '../../../../../features/admin/pages/ModelAdmin.tsx'
import { adminModelsQuery, adminRolesQuery } from '../../../../../features/admin/queries.ts'
import { validateModelSearch } from '../../../../../shared/search-params.ts'

export const Route = createFileRoute('/_app/admin/plugins/$id/model')({
  validateSearch: validateModelSearch,
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(adminModelsQuery).then(noop, noop),
      context.queryClient.query(adminRolesQuery).then(noop, noop),
    ]),
  component: Model,
})

function Model() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return <ModelAdmin pluginId={id} provider={search.provider} modelId={search.id} />
}
