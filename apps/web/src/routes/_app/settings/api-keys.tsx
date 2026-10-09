import { createFileRoute } from '@tanstack/react-router'
import { ApiKeySettings } from '../../../features/settings/pages/ApiKeySettings.tsx'
import { credentialsQuery, providersQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/api-keys')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(providersQuery),
      context.queryClient.query(credentialsQuery),
    ]),
  component: ApiKeySettings,
})
