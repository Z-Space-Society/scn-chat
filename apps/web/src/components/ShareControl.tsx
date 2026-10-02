import { useForm, useStore as useFormStore } from '@tanstack/react-form'
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
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ mode, members }: { mode: Mode; members: string }) => {
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
  const form = useForm({
    defaultValues: {
      mode: settings?.mode ?? ('private' as Mode),
      members: settings?.members.map((m) => m.handle ?? m.did).join(', ') ?? '',
    },
    onSubmit: ({ value }) => save.mutate(value),
  })
  const mode = useFormStore(form.store, (state) => state.values.mode)
  const error = save.error ? messageOf(save.error) : loadError
  return (
    <fieldset>
      <legend>Sharing</legend>
      <form.Field name="mode">
        {(field) => (
          <select
            aria-label="Sharing mode"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value as Mode)}
          >
            <option value="private">Private</option>
            <option value="people">Specific people</option>
            <option value="public">Anyone with an atproto account</option>
          </select>
        )}
      </form.Field>
      {mode === 'people' && (
        <form.Field name="members">
          {(field) => (
            <input
              aria-label="People"
              placeholder="Handles, separated by commas"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
      )}
      <button type="button" onClick={() => void form.handleSubmit()}>
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
