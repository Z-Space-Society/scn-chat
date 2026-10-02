import { createFileRoute, redirect } from '@tanstack/react-router'
import { validateLoginSearch } from '../lib/search-params.ts'
import { LoginPage } from '../pages/LoginPage.tsx'

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context }) => {
    if (context.session.state === 'signed-in') throw redirect({ to: '/' })
  },
  component: Login,
})

function Login() {
  const { error, next } = Route.useSearch()
  return <LoginPage error={error} next={next} />
}
