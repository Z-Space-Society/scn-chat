import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useOpenStore } from '../../../store/react.tsx'
import { accountQuery } from '../queries.ts'

/**
 * Background sync, and rebuilding this device's copy of the chats. The account is optional, so
 * rebuilding works even when it fails to load.
 */
export function SyncSettings() {
  const openStore = useOpenStore()
  const account = useQuery(accountQuery)
  const queryClient = useQueryClient()
  const setBackgroundSync = useMutation({
    mutationFn: (backgroundSync: boolean) =>
      read(api.chats.account.$put({}, json({ backgroundSync }))),
    onSuccess: (_result, backgroundSync) =>
      queryClient.setQueryData(
        accountQuery.queryKey,
        (current) => current && { ...current, backgroundSync },
      ),
  })
  const rebuild = useMutation({
    mutationFn: async () => {
      await openStore().deleteLocalCopy()
      // Reload to open a fresh copy and sync it from the server.
      location.reload()
    },
  })
  // While saving, the switch shows the value being saved.
  const backgroundSync = setBackgroundSync.isPending
    ? setBackgroundSync.variables
    : account.data?.backgroundSync
  return (
    <section>
      <h2>Sync</h2>
      {account.data?.allowUserOptOut && (
        <label>
          <input
            type="checkbox"
            checked={backgroundSync}
            onChange={(e) => setBackgroundSync.mutate(e.target.checked)}
          />{' '}
          Keep my chats in sync in the background
        </label>
      )}
      <button type="button" onClick={() => rebuild.mutate()}>
        Rebuild this device's copy
      </button>
      <ErrorAlert error={lastError(setBackgroundSync, rebuild) ?? account.error} />
    </section>
  )
}
