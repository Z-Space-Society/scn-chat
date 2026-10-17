import { createFileRoute } from '@tanstack/react-router'
import { type Section, SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const sections: Section[] = [
  { key: 'sync', fields: ['safetyNet'] },
  { key: 'sync', fields: ['discovery'] },
  { key: 'sync', title: 'Opting out', fields: ['allowUserOptOut'] },
]

export const Route = createFileRoute('/_app/admin/sync')({
  staticData: { title: 'Sync' },
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => (
    <SettingsAdmin
      title="Sync"
      description="How the server keeps up with chats changed outside the app."
      sections={sections}
    />
  ),
})
