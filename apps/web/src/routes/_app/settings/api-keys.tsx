import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ApiKeySettings } from '../../../pages/settings/api-keys.tsx'
import { credentialsQuery, providersQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/settings/api-keys')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query(providersQuery).then(noop, noop),
      context.queryClient.query(credentialsQuery).then(noop, noop),
    ]),
  component: ApiKeySettings,
})
