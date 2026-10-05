import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../api.ts'
import { lastError, messageOf } from '../../lib/errors.ts'
import { accountQuery } from '../../queries.ts'
import { useOpenStore } from '../../store/react.tsx'

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
  const error = lastError(setBackgroundSync, rebuild) ?? (account.error && messageOf(account.error))
  return (
    <section>
      <h2>Sync</h2>
      {account.data?.allowUserOptOut && (
        <label>
          <input
            type="checkbox"
            checked={account.data.backgroundSync}
            onChange={(e) => setBackgroundSync.mutate(e.target.checked)}
          />{' '}
          Keep my chats in sync in the background
        </label>
      )}
      <button type="button" onClick={() => rebuild.mutate()}>
        Rebuild this device's copy
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
