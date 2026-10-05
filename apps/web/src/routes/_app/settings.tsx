import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '../../pages/settings/layout.tsx'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
