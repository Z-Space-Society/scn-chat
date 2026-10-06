import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '../../features/settings/pages/SettingsLayout.tsx'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
