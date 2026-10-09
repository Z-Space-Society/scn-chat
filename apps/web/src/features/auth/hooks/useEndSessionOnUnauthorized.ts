import { useEffect } from 'react'
import { onUnauthorized } from '../../../shared/api.ts'
import { endSession } from '../session.ts'

/** Sign this device out once a request, or the store's sync, finds the session has ended. */
export function useEndSessionOnUnauthorized(did: string) {
  useEffect(() => onUnauthorized(() => endSession(did)), [did])
}
