import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../api.ts'
import { messageOf } from '../lib/errors.ts'
import { sharingQuery } from '../queries.ts'

type Mode = 'private' | 'people' | 'public'
type Settings = { mode: Mode; members: { did: string; handle: string | null }[] }

/** Who can read this conversation, and its link. */
export function ShareControl({ skey, ownerDid }: { skey: string; ownerDid: string }) {
  const [open, setOpen] = useState(false)
  const settings = useQuery({ ...sharingQuery(skey), enabled: open })
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Share
      </button>
    )
  }
  return (
    <SharingForm
      // Start over from the stored settings whenever they load or change.
      key={settings.dataUpdatedAt}
      skey={skey}
      link={`${location.origin}/shared/${ownerDid}/${skey}`}
      settings={settings.data}
      loadError={settings.error ? messageOf(settings.error) : null}
      onClose={() => setOpen(false)}
    />
  )
}

function SharingForm({
  skey,
  link,
  settings,
  loadError,
  onClose,
}: {
  skey: string
  link: string
  settings: Settings | undefined
  loadError: string | null
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>(settings?.mode ?? 'private')
  const [members, setMembers] = useState(
    settings?.members.map((m) => m.handle ?? m.did).join(', ') ?? '',
  )
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => {
      const list = members
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      return read(
        api.sharing.conversations[':skey'].sharing.$put(
          { param: { skey } },
          json({ mode, members: list }),
        ),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharingQuery(skey).queryKey }),
  })
  const error = save.error ? messageOf(save.error) : loadError
  return (
    <fieldset>
      <legend>Sharing</legend>
      <select
        aria-label="Sharing mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as Mode)}
      >
        <option value="private">Private</option>
        <option value="people">Specific people</option>
        <option value="public">Anyone with an atproto account</option>
      </select>
      {mode === 'people' && (
        <input
          aria-label="People"
          placeholder="Handles, separated by commas"
          value={members}
          onChange={(e) => setMembers(e.target.value)}
        />
      )}
      <button type="button" onClick={() => save.mutate()}>
        Save
      </button>
      {mode !== 'private' && <input aria-label="Link" readOnly value={link} />}
      <button type="button" onClick={onClose}>
        Close
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
