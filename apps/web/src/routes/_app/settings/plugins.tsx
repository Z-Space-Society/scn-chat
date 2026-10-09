import { createFileRoute } from '@tanstack/react-router'
import { PluginSettings } from '../../../features/settings/pages/PluginSettings.tsx'
import { pluginSettingsQuery } from '../../../features/settings/queries.ts'

export const Route = createFileRoute('/_app/settings/plugins')({
  loader: ({ context }) => context.queryClient.query(pluginSettingsQuery),
  component: PluginSettings,
})
