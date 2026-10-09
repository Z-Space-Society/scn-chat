import { useMutation } from '@tanstack/react-query'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { signOut } from '../sign-out.ts'

/** Sign a viewer out. They have no chats on this device to delete. */
export function ViewerSignOut() {
  const signingOut = useMutation({ mutationFn: () => signOut() })
  return (
    <>
      <button type="button" onClick={() => signingOut.mutate()}>
        Sign out
      </button>
      <ErrorAlert error={signingOut.error} />
    </>
  )
}
