import { noop } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PluginSettings } from '../../../pages/SettingsPage.tsx'
import { pluginSettingsQuery } from '../../../queries.ts'

export const Route = createFileRoute('/_app/settings/plugins')({
  // Prefetching renders the section with its data on the server. A failed fetch shows in the section.
  loader: ({ context }) =>
    Promise.all([context.queryClient.query(pluginSettingsQuery).then(noop, noop)]),
  component: PluginSettings,
})
