import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { onUnauthorized } from '../api.ts'
import { syncTimeZone } from '../lib/time-zone.ts'
import { endSession, MeContext } from '../session.tsx'

/** The signed-in routes. Signed-out requests are sent to the login page, from the server too. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context }) => {
    if (context.session.state !== 'signed-in') throw redirect({ to: '/login' })
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
    return onUnauthorized(() => endSession(me.did))
  }, [me.did, queryClient])
  return (
    <MeContext.Provider value={me}>
      <Outlet />
    </MeContext.Provider>
  )
}
