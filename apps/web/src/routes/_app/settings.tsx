import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '../../pages/SettingsPage.tsx'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
