import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { sharingQuery } from '../queries.ts'

type Mode = 'private' | 'people' | 'public'
type Settings = { mode: Mode; members: { did: string; handle: string | null }[] }

interface ShareControlProps {
  skey: string
  ownerDid: string
}

/** Who can read this conversation, and its link. */
export function ShareControl(props: ShareControlProps) {
  const [open, setOpen] = useState(false)
  const settings = useQuery({ ...sharingQuery(props.skey), enabled: open })
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
      skey={props.skey}
      link={`${location.origin}/shared/${props.ownerDid}/${props.skey}`}
      settings={settings.data}
      loadError={settings.error ? messageOf(settings.error) : null}
      onClose={() => setOpen(false)}
    />
  )
}

interface SharingFormProps {
  skey: string
  link: string
  settings: Settings | undefined
  loadError: string | null
  onClose: () => void
}

function SharingForm(props: SharingFormProps) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: ({ mode, members }: { mode: Mode; members: string }) => {
      const list = members
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
      return read(
        api.sharing.conversations[':skey'].sharing.$put(
          { param: { skey: props.skey } },
          json({ mode, members: list }),
        ),
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharingQuery(props.skey).queryKey }),
  })
  const form = useForm({
    defaultValues: {
      mode: props.settings?.mode ?? ('private' as Mode),
      members: props.settings?.members.map((m) => m.handle ?? m.did).join(', ') ?? '',
    },
    onSubmit: ({ value }) => save.mutate(value),
  })
  const mode = useFormStore(form.store, (state) => state.values.mode)
  const error = save.error ? messageOf(save.error) : props.loadError
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
      {mode !== 'private' && <input aria-label="Link" readOnly value={props.link} />}
      <button type="button" onClick={props.onClose}>
        Close
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
