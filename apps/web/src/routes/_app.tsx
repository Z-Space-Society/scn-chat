import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { onUnauthorized } from '../api.ts'
import { syncTimeZone } from '../lib/time-zone.ts'
import { endSession, MeContext } from '../session.tsx'

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
  const queryClient = useQueryClient()
  useEffect(() => {
    syncTimeZone(queryClient).catch((err: unknown) =>
      console.warn('Could not save the time zone', err),
    )
  }, [queryClient])
  useEffect(() => onUnauthorized(() => endSession(me.did)), [me.did])
  return (
    <MeContext.Provider value={me}>
      <Outlet />
    </MeContext.Provider>
  )
}
