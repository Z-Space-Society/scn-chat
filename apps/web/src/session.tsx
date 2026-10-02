import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { ApiError } from './api.ts'
import { messageOf } from './lib/errors.ts'
import { meQuery } from './queries.ts'

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
  const { data, error } = useQuery(meQuery)
  if (data) return { state: 'signed-in', me: data as Me }
  if (error instanceof ApiError && error.status === 401) return { state: 'signed-out' }
  if (error) return { state: 'error', message: messageOf(error) }
  return { state: 'loading' }
}

/** The checked session, once it is known. */
export const SessionContext = createContext<Exclude<Session, { state: 'loading' | 'error' }>>({
  state: 'signed-out',
})

export const useSession = () => useContext(SessionContext)
