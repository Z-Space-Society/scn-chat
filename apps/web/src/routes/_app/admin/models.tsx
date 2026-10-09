import { createFileRoute } from '@tanstack/react-router'
import { ModelsAdmin } from '../../../features/admin/pages/ModelsAdmin.tsx'
import { adminModelsQuery } from '../../../features/admin/queries.ts'

export const Route = createFileRoute('/_app/admin/models')({
  loader: ({ context }) => context.queryClient.query(adminModelsQuery),
  component: ModelsAdmin,
})
