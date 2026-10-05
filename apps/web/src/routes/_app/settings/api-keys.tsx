import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ApiKeySettings } from '../../../features/settings/pages/ApiKeySettings.tsx'
import { credentialsQuery, providersQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/api-keys')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(providersQuery).then(noop, noop),
      context.queryClient.query(credentialsQuery).then(noop, noop),
    ]),
  component: ApiKeySettings,
})
