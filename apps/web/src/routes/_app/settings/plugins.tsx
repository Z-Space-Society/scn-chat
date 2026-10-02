import { createFileRoute } from '@tanstack/react-router'
import { PluginSettings } from '../../../pages/SettingsPage.tsx'

export const Route = createFileRoute('/_app/settings/plugins')({ component: PluginSettings })
