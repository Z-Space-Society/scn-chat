import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ModelsAdmin } from '../../../pages/admin/models.tsx'
import { adminModelsQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/admin/models')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminModelsQuery).then(noop, noop)]),
  component: ModelsAdmin,
})
