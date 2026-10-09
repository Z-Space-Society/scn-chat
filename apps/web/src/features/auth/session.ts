import type { QueryClient } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { ApiError } from '../../shared/api.ts'
import { messageOf } from '../../shared/errors.ts'
import { openStore } from '../../store/client.ts'
import { meQuery } from './queries.ts'
import { toLogin } from './sign-out.ts'

export interface Me {
  did: string
  handle: string | null
  storageMode: 'space' | 'local'
  backgroundSync: boolean
  roles: string[]
  admin: boolean
  /** Viewers can only open chats shared with them. */
  access: 'full' | 'viewer'
  accessMessage: string | null
}

export const MeContext = createContext<Me | null>(null)

export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe needs a signed-in user')
  return me
}

export type Session = { state: 'signed-out' } | { state: 'signed-in'; me: Me }

/**
 * Ask the server who is signed in, through the query cache, so the answer reaches the browser with
 * a server-rendered page. A 401 means signed out, and any other failure throws.
 */
export async function checkSession(queryClient: QueryClient): Promise<Session> {
  try {
    return {
      state: 'signed-in',
      me: (await queryClient.query({ ...meQuery, staleTime: 'static' })) as Me,
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { state: 'signed-out' }
    throw new Error(`Could not reach the server: ${messageOf(err)}`, { cause: err })
  }
}

/** Sign this device out after the session ended: delete its copy of the chats, then go to login. */
export function endSession(did: string) {
  openStore(did)
    .deleteLocalCopy()
    .catch((err: unknown) => console.error('Could not delete the local copy', err))
    .finally(toLogin)
}
