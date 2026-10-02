import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { onUnauthorized } from '../api.ts'
import { syncTimeZone } from '../lib/time-zone.ts'
import { type Me, MeContext, useSession } from '../session.tsx'
import { openStore } from '../store/client.ts'
import { StoreProvider } from '../store/react.tsx'

/** The signed-in routes, with the user's local copy of their chats. */
export const Route = createFileRoute('/_app')({ component: SignedInLayout })

function SignedInLayout() {
  const session = useSession()
  if (session.state !== 'signed-in') return <Navigate to="/login" replace />
  return <SignedIn me={session.me} />
}

function SignedIn({ me }: { me: Me }) {
  const store = openStore(me.did)
  useEffect(() => {
    const ended = () =>
      // Use a full page load, since the signed-in routes redirect /login to /.
      store
        .deleteLocalCopy()
        .catch((err: unknown) => console.error('Could not delete the local copy', err))
        .finally(() => location.assign('/login'))
    syncTimeZone().catch((err: unknown) => console.warn('Could not save the time zone', err))
    const stopApi = onUnauthorized(ended)
    const stopStore = store.onChange((change) => change.type === 'unauthorized' && ended())
    return () => {
      stopApi()
      stopStore()
    }
  }, [store])
  return (
    <MeContext.Provider value={me}>
      <StoreProvider store={store}>
        <Outlet />
      </StoreProvider>
    </MeContext.Provider>
  )
}
