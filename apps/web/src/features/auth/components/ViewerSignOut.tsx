import { useMutation } from '@tanstack/react-query'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { signOut } from '../sign-out.ts'

/**
 * Sign a viewer out, as a quiet link under the form so it doesn't compete with signing in. They
 * have no chats on this device to delete.
 */
export function ViewerSignOut() {
  const signingOut = useMutation({ mutationFn: () => signOut() })
  return (
    <div className="mt-4">
      <Button tone="link" onClick={() => signingOut.mutate()}>
        Sign out
      </Button>
      <ErrorAlert error={signingOut.error} className="mt-2 text-small" />
    </div>
  )
}
