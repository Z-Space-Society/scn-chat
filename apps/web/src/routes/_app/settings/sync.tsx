import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SyncSettings } from '../../../features/settings/pages/SyncSettings.tsx'
import { accountQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/sync')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) => Promise.all([context.queryClient.query(accountQuery).then(noop, noop)]),
  component: SyncSettings,
})
