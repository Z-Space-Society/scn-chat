import { api, read } from '../api.ts'
import { useOpenStore } from '../store/react.tsx'

/** Sign out, delete this device's copy of the chats, and go to the login page. */
export function useSignOut() {
  const openStore = useOpenStore()
  return async () => {
    await read(api.auth.logout.$post())
    await openStore().deleteLocalCopy()
    location.assign('/login')
  }
}
