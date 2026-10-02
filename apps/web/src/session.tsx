import { createContext, useContext, useEffect, useState } from 'react'
import { ApiError, api, read } from './api.ts'
import { messageOf } from './components/useAction.ts'

export type Me = {
  did: string
  handle: string | null
  storageMode: 'space' | 'local'
  backgroundSync: boolean
  roles: string[]
}

export const MeContext = createContext<Me | null>(null)

export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe needs a signed-in user')
  return me
}

export type Session =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; me: Me }
  | { state: 'error'; message: string }

/** Ask the server who is signed in. */
export function useSessionCheck(): Session {
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

/** The checked session, once it is known. */
export const SessionContext = createContext<Exclude<Session, { state: 'loading' | 'error' }>>({
  state: 'signed-out',
})

export const useSession = () => useContext(SessionContext)
