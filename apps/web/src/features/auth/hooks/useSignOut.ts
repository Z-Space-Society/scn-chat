import { api, read } from '../../../shared/api.ts'
import { useOpenStore } from '../../../store/react.tsx'

export function useSignOut() {
  const openStore = useOpenStore()
  return async () => {
    await read(api.auth.logout.$post())
    await openStore().deleteLocalCopy()
    location.assign('/login')
  }
}
