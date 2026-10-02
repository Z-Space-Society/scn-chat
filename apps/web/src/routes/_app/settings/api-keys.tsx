import { createFileRoute } from '@tanstack/react-router'
import { ApiKeys } from '../../../pages/SettingsPage.tsx'
import { credentialsQuery, providersQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/settings/api-keys')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(providersQuery),
      context.queryClient.prefetchQuery(credentialsQuery),
    ]),
  component: ApiKeys,
})
