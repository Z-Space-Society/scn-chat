import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { api, read } from '../api.ts'
import { messageOf } from '../lib/errors.ts'
import { validateLoginSearch } from '../lib/search-params.ts'
import { LoginPage } from '../pages/LoginPage.tsx'

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

/** Sign a viewer out. They have no chats on this device to delete. */
function ViewerSignOut() {
  const signOut = useMutation({
    mutationFn: async () => {
      await read(api.auth.logout.$post())
      location.assign('/login')
    },
  })
  return (
    <>
      <button type="button" onClick={() => signOut.mutate()}>
        Sign out
      </button>
      {signOut.error && <p role="alert">{messageOf(signOut.error)}</p>}
    </>
  )
}
