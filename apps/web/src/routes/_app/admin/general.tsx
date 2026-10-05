import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const keys = ['general', 'sessions']

export const Route = createFileRoute('/_app/admin/general')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(adminSettingsQuery).then(noop, noop)]),
  component: () => <SettingsAdmin title="General" keys={keys} />,
})
