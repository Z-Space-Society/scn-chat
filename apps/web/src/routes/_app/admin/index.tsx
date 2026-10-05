import { createFileRoute, redirect } from '@tanstack/react-router'

/** The admin area opens on its users. */
export const Route = createFileRoute('/_app/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/users' })
  },
})
