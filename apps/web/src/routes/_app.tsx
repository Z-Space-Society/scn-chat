import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEndSessionOnUnauthorized } from '../features/auth/hooks/useEndSessionOnUnauthorized.ts'
import { MeContext } from '../features/auth/session.ts'
import { useSyncTimeZone } from '../features/settings/hooks/useSyncTimeZone.ts'

/**
 * The signed-in routes. Signed-out requests are sent to the login page, from the server too, and
 * so are viewers, who may only open shared chats and see why on the login page.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (context.session.state !== 'signed-in' || context.session.me.access !== 'full')
      throw redirect({ to: '/login' })
    return { me: context.session.me }
  },
  component: SignedIn,
})

function SignedIn() {
  const { me } = Route.useRouteContext()
  useSyncTimeZone()
  useEndSessionOnUnauthorized(me.did)
  return (
    <MeContext.Provider value={me}>
      <Outlet />
    </MeContext.Provider>
  )
}
