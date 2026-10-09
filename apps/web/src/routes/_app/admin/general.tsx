import { createFileRoute } from '@tanstack/react-router'
import { SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const keys = ['general', 'sessions']

export const Route = createFileRoute('/_app/admin/general')({
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => <SettingsAdmin title="General" keys={keys} />,
})
