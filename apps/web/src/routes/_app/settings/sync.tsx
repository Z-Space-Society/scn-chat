import { createFileRoute } from '@tanstack/react-router'
import { Device } from '../../../pages/SettingsPage.tsx'

export const Route = createFileRoute('/_app/settings/sync')({ component: Device })
