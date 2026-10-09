import { useMutation } from '@tanstack/react-query'
import { api, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'

/** Sign a viewer out. They have no chats on this device to delete. */
export function ViewerSignOut() {
  const signOut = useMutation({
    mutationFn: async () => {
      await read(api.auth.logout.$post())
      location.assign('/login')
    },
  })
  return (
    <>
      <button type="button" onClick={() => signOut.mutate()}>
        Sign out
      </button>
      <ErrorAlert error={signOut.error} />
    </>
  )
}
