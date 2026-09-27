import { api, read } from '../api.ts'
import { useStore } from '../store/react.tsx'

/** Sign out, delete this device's copy of the chats, and go to the login page. */
export function useSignOut() {
  const store = useStore()
  return async () => {
    await read(api.auth.logout.$post())
    await store.deleteLocalCopy()
    location.assign('/login')
  }
}
