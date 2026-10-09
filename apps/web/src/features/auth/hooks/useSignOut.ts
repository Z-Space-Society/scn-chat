import { useMutation } from '@tanstack/react-query'
import { useOpenStore } from '../../../store/react.tsx'
import { signOut } from '../sign-out.ts'

/** Sign this device out, deleting its copy of the chats. */
export function useSignOut() {
  const openStore = useOpenStore()
  return useMutation({ mutationFn: () => signOut(openStore()) })
}
