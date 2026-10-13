import { createFileRoute } from '@tanstack/react-router'
import { type Section, SettingsAdmin } from '../../../features/admin/pages/SettingsAdmin.tsx'
import { adminSettingsQuery } from '../../../features/admin/queries.ts'

const sections: Section[] = [
  {
    key: 'turns',
    title: 'Limits',
    fields: ['ratePerMinute', 'maxSteps', 'timeoutSeconds', 'backfillMinutes'],
  },
  { key: 'turns', title: 'Instructions', fields: ['systemPrompt'] },
]

export const Route = createFileRoute('/_app/admin/turns')({
  loader: ({ context }) => context.queryClient.query(adminSettingsQuery),
  component: () => (
    <SettingsAdmin
      title="Turns"
      description="How replies run: how often people can send, how long a reply may take, and the system prompt."
      sections={sections}
    />
  ),
})
