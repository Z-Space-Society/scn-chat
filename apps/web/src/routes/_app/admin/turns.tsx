import { createFileRoute } from '@tanstack/react-router'
import { SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const keys = ['turns']

export const Route = createFileRoute('/_app/admin/turns')({
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => <SettingsAdmin title="Turns" keys={keys} />,
})
