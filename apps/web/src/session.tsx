import { createContext, useContext } from 'react'

export type Me = {
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
