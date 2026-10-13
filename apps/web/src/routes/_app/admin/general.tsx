import { createFileRoute } from '@tanstack/react-router'
import { type Section, SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const sections: Section[] = [{ key: 'general' }, { key: 'sessions' }]

export const Route = createFileRoute('/_app/admin/general')({
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => (
    <SettingsAdmin
      title="General"
      description="The app's name, and how long people stay signed in."
      sections={sections}
    />
  ),
})
