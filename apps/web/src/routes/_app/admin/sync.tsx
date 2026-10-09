import { createFileRoute } from '@tanstack/react-router'
import { SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const keys = ['sync']

export const Route = createFileRoute('/_app/admin/sync')({
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => <SettingsAdmin title="Sync" keys={keys} />,
})
