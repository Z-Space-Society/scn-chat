import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { formatMembers, type Members, parseMembers } from '../lib/members.ts'
import { sharingQuery } from '../queries.ts'

type Mode = 'private' | 'people' | 'public'

interface Settings {
  mode: Mode
  members: Members
}

interface Props {
  skey: string
  ownerDid: string
}

/** Who can read this conversation, and its link. */
export function ShareControl(props: Props) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Share
      </button>
    )
  return <SharingPanel skey={props.skey} ownerDid={props.ownerDid} onClose={() => setOpen(false)} />
}

interface SharingPanelProps extends Props {
  onClose: () => void
}

/** The sharing form, once the stored settings load. */
function SharingPanel(props: SharingPanelProps) {
  const settings = useQuery(sharingQuery(props.skey))
  if (settings.error)
    return (
      <fieldset>
        <legend>Sharing</legend>
        <ErrorAlert error={settings.error} />
        <CloseButton onClose={props.onClose} />
      </fieldset>
    )
  if (!settings.data) return <p>Loading…</p>
  return (
    <SharingForm
      skey={props.skey}
      // The chat routes render only in the browser, so the page's origin is known.
      link={`${location.origin}/shared/${props.ownerDid}/${props.skey}`}
      settings={settings.data}
      onClose={props.onClose}
    />
  )
}

interface SharingFormProps {
  skey: string
  link: string
  settings: Settings
  onClose: () => void
}

function SharingForm(props: SharingFormProps) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (draft: { mode: Mode; members: string }) =>
      read(
        api.sharing.conversations[':skey'].sharing.$put(
          { param: { skey: props.skey } },
          json({ mode: draft.mode, members: parseMembers(draft.members) }),
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sharingQuery(props.skey).queryKey }),
  })
  const form = useAppForm({
    defaultValues: { mode: props.settings.mode, members: formatMembers(props.settings.members) },
    onSubmit: ({ value }) => save.mutate(value),
  })
  const mode = useFormStore(form.store, (state) => state.values.mode)
  return (
    <form.AppForm>
      <form.Form>
        <fieldset>
          <legend>Sharing</legend>
          <form.AppField name="mode">
            {(field) => (
              <field.SelectField aria-label="Sharing mode">
                <option value="private">Private</option>
                <option value="people">Specific people</option>
                <option value="public">Anyone with an atproto account</option>
              </field.SelectField>
            )}
          </form.AppField>
          {mode === 'people' && (
            <form.AppField name="members">
              {(field) => (
                <field.TextField aria-label="People" placeholder="Handles, separated by commas" />
              )}
            </form.AppField>
          )}
          <form.SubmitButton>Save</form.SubmitButton>
          {mode !== 'private' && <input aria-label="Link" readOnly value={props.link} />}
          <CloseButton onClose={props.onClose} />
          <ErrorAlert error={save.error} />
        </fieldset>
      </form.Form>
    </form.AppForm>
  )
}

interface CloseButtonProps {
  onClose: () => void
}

function CloseButton(props: CloseButtonProps) {
  return (
    <button type="button" onClick={props.onClose}>
      Close
    </button>
  )
}
