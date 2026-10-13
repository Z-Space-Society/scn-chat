import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { CloudIcon, DriveIcon } from '../../../shared/icons.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { Switch } from '../../../shared/ui/controls.tsx'
import {
  Callout,
  SettingRow,
  SettingRowSkeleton,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { useOpenStore } from '../../../store/react.tsx'
import { useMe } from '../../auth/session.ts'
import { accountQuery } from '../queries.ts'

/**
 * Where the chats are kept, background sync, and rebuilding this device's copy of them. The
 * account is optional, so rebuilding works even when it fails to load.
 */
export function SyncSettings() {
  const openStore = useOpenStore()
  const me = useMe()
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
    <SettingsPage
      title="Sync"
      description="Where your chats are kept, and how this device keeps up with them."
    >
      <StorageNote local={me.storageMode === 'local'} />
      <SettingsGroup>
        {account.isPending && <SettingRowSkeleton />}
        {account.data?.allowUserOptOut && (
          <SettingRow
            label="Keep chats in sync in the background"
            htmlFor="background-sync"
            description="The server checks your storage now and then for changes it missed. When off, chats sync only when you open them or a change is reported."
          >
            <Switch
              id="background-sync"
              checked={backgroundSync}
              disabled={setBackgroundSync.isPending}
              onChange={(e) => setBackgroundSync.mutate(e.target.checked)}
            />
          </SettingRow>
        )}
        <SettingRow
          label="Rebuild this device's copy"
          description="Clears the chats saved in this browser and downloads them again. Try it if chats look out of date or missing. Nothing is deleted from where your chats are stored."
        >
          <Button
            aria-label="Rebuild this device's copy"
            busy={rebuild.isPending}
            onClick={() => rebuild.mutate()}
          >
            Rebuild
          </Button>
        </SettingRow>
      </SettingsGroup>
      <ErrorAlert error={lastError(setBackgroundSync, rebuild) ?? account.error} />
    </SettingsPage>
  )
}

interface StorageNoteProps {
  /** Whether the chats are kept on this server, since the user's PDS doesn't support spaces. */
  local: boolean
}

/** Where the chats are kept: green when on the user's own PDS, as they should be. */
function StorageNote(props: StorageNoteProps) {
  if (props.local)
    return (
      <Callout icon={<DriveIcon />}>
        <strong className="block font-semibold">Stored on this server</strong>
        Your PDS doesn't support spaces yet, so your chats are kept on this server until it does.
      </Callout>
    )
  return (
    <Callout tone="good" icon={<CloudIcon />}>
      <strong className="block font-semibold">Stored on your PDS</strong>
      Every chat is a space on your own PDS. This server keeps no copy of them.
    </Callout>
  )
}
