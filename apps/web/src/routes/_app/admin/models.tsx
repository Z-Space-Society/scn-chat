import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ModelsAdmin } from '../../../features/admin/pages/ModelsAdmin.tsx'
import { adminModelsQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/models')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminModelsQuery).then(noop, noop)]),
  component: ModelsAdmin,
})
