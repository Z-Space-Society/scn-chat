import { createFileRoute, redirect } from '@tanstack/react-router'
import { ViewerSignOut } from '../features/auth/components/ViewerSignOut.tsx'
import { LoginPage } from '../features/auth/pages/LoginPage.tsx'
import { validateLoginSearch } from '../shared/search-params.ts'

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context }) => {
    // Viewers stay, to see why they can only open shared chats.
    if (context.session.state === 'signed-in' && context.session.me.access === 'full')
      throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const { error, next } = Route.useSearch()
  const { session } = Route.useRouteContext()
  if (session.state === 'signed-out') return <LoginPage error={error} next={next} />
  return (
    <LoginPage error={error} next={next} notice={session.me.accessMessage}>
      <ViewerSignOut />
    </LoginPage>
  )
}
