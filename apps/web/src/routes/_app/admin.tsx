import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminLayout } from '../../features/admin/pages/AdminLayout.tsx'

/** The admin area, for admins only. Everyone else is sent to their chats, from the server too. */
export const Route = createFileRoute('/_app/admin')({
  beforeLoad: ({ context }) => {
    if (!context.me.admin) throw redirect({ to: '/' })
  },
  component: () => (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  ),
})
