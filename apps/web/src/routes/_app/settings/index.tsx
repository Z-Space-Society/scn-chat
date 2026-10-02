import { createFileRoute } from '@tanstack/react-router'
import { PreferencesSettings } from '../../../pages/SettingsPage.tsx'

export const Route = createFileRoute('/_app/settings/')({ component: PreferencesSettings })
