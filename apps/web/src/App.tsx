import { useEffect, useState } from 'react'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { ApiError, api, onUnauthorized, read } from './api.ts'
import { messageOf } from './components/useAction.ts'
import { syncTimeZone } from './lib/time-zone.ts'
import { ChatPage } from './pages/ChatPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { SharedPage } from './pages/SharedPage.tsx'
import { type Me, MeContext } from './session.tsx'
import { openStore } from './store/client.ts'
import { StoreProvider } from './store/react.tsx'

type Session =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; me: Me }
  | { state: 'error'; message: string }

export function useSession(): Session {
  const [session, setSession] = useState<Session>({ state: 'loading' })
  useEffect(() => {
    read(api.auth.me.$get())
      .then((me) => setSession({ state: 'signed-in', me: me as Me }))
      .catch((err: unknown) =>
        setSession(
          err instanceof ApiError && err.status === 401
            ? { state: 'signed-out' }
            : { state: 'error', message: messageOf(err) },
        ),
      )
  }, [])
  return session
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
        <Switch>
          <Route path="/c/:skey">{(params) => <ChatPage skey={params.skey} />}</Route>
          <Route path="/settings" nest>
            <SettingsPage />
          </Route>
          <Route path="/login">
            <Redirect to="/" />
          </Route>
          <Route>
            <ChatPage />
          </Route>
        </Switch>
      </StoreProvider>
    </MeContext.Provider>
  )
}

export function App() {
  const session = useSession()
  if (session.state === 'loading') return <p>Loading...</p>
  if (session.state === 'error')
    return <p role="alert">Could not reach the server: {session.message}</p>
  const signedIn = session.state === 'signed-in'
  return (
    <Switch>
      <Route path="/s/:ownerDid/:skey">
        {(params) => (
          <SharedPage ownerDid={params.ownerDid} skey={params.skey} signedIn={signedIn} />
        )}
      </Route>
      <Route>{signedIn ? <SignedIn me={session.me} /> : <SignedOut />}</Route>
    </Switch>
  )
}

function SignedOut() {
  const [location] = useLocation()
  if (location !== '/login') return <Redirect to="/login" />
  return <LoginPage />
}
