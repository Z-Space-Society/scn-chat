import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SettingsAdmin } from '../../../pages/admin/settings.tsx'
import { adminSettingsQuery } from '../../../queries.ts'

const keys = ['sync']

export const Route = createFileRoute('/_app/admin/sync')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminSettingsQuery).then(noop, noop)]),
  component: () => <SettingsAdmin title="Sync" keys={keys} />,
})
