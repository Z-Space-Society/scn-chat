import { createFileRoute } from '@tanstack/react-router'
import { ApiKeys } from '../../../pages/SettingsPage.tsx'

export const Route = createFileRoute('/_app/settings/api-keys')({ component: ApiKeys })
