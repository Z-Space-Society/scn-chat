import { createFileRoute } from '@tanstack/react-router'
import { SyncSettings } from '../../../features/settings/pages/SyncSettings.tsx'
import { accountQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/sync')({
  // The account is optional, so rebuilding this device's copy works when it fails to load.
  loader: ({ context }) => context.queryClient.prefetchQuery(accountQuery),
  component: SyncSettings,
})
