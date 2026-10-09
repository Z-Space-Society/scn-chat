import { useMutation } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { lastError } from '../../../shared/errors.ts'
import { useRolesChanged, useUsersChanged } from './changes.ts'

/** Add an account to a role or remove it, and suspend or restore it, with one error for them all. */
export function useUserActions() {
  const usersChanged = useUsersChanged()
  // Explicit members are listed on the roles page too.
  const membersChanged = useRolesChanged()
  const addToRole = useMutation({
    mutationFn: (draft: { role: string; did: string }) =>
      read(
        api.admin.roles[':name'].members.$post(
          { param: { name: draft.role } },
          json({ identifier: draft.did }),
        ),
      ),
    onSuccess: membersChanged,
  })
  const removeFromRole = useMutation({
    mutationFn: (draft: { role: string; did: string }) =>
      read(
        api.admin.roles[':name'].members[':did'].$delete({
          param: { name: draft.role, did: draft.did },
        }),
      ),
    onSuccess: membersChanged,
  })
  const suspend = useMutation({
    mutationFn: (draft: { did: string; reason: string }) =>
      read(
        api.admin.users[':did'].suspend.$post(
          { param: { did: draft.did } },
          json(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
        ),
      ),
    onSuccess: usersChanged,
  })
  const restore = useMutation({
    mutationFn: (did: string) => read(api.admin.users[':did'].restore.$post({ param: { did } })),
    onSuccess: usersChanged,
  })
  return {
    addToRole: (role: string, did: string) => addToRole.mutate({ role, did }),
    removeFromRole: (role: string, did: string) => removeFromRole.mutate({ role, did }),
    suspend: (did: string, reason: string) => suspend.mutate({ did, reason }),
    restore: (did: string) => restore.mutate(did),
    error: lastError(addToRole, removeFromRole, suspend, restore),
  }
}

export type UserActions = ReturnType<typeof useUserActions>
