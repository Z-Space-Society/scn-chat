import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { field } from '../../../shared/ui/controls.tsx'
import { PanelCard, panelForm } from '../../../shared/ui/PanelCard.tsx'
import { Select } from '../../../shared/ui/Select.tsx'
import { Loading, Skeleton } from '../../../shared/ui/Skeleton.tsx'
import { formatMembers, type Members, parseMembers } from '../lib/members.ts'
import { sharingQuery } from '../queries.ts'

type Mode = 'private' | 'people' | 'public'

const modes: { value: Mode; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'people', label: 'Specific people' },
  { value: 'public', label: 'Anyone with an atproto account' },
]

interface Settings {
  mode: Mode
  members: Members
}

interface Props {
  skey: string
  ownerDid: string
  onClose: () => void
  /** Classes that place the panel, such as under the control that opened it. */
  className?: string
}

/** Who can read this conversation, and its link, once the stored settings load. */
export function SharePanel(props: Props) {
  const settings = useQuery(sharingQuery(props.skey))
  if (settings.error)
    return (
      <PanelCard title="Sharing" className={props.className}>
        <ErrorAlert error={settings.error} className="w-full text-small" />
        <CloseButton onClose={props.onClose} />
      </PanelCard>
    )
  if (!settings.data)
    return (
      <PanelCard title="Sharing" className={props.className}>
        {/* The mode's select and Save, on their way. */}
        <Loading label="Loading sharing" className="flex min-w-48 flex-1 gap-2">
          <Skeleton className="h-8.5 flex-1" />
          <Skeleton className="h-8.5 w-14" />
        </Loading>
        <CloseButton onClose={props.onClose} />
      </PanelCard>
    )
  return (
    <SharingForm
      skey={props.skey}
      // The chat routes render only in the browser, so the page's origin is known.
      link={`${location.origin}/shared/${props.ownerDid}/${props.skey}`}
      settings={settings.data}
      onClose={props.onClose}
      className={props.className}
    />
  )
}

interface SharingFormProps {
  skey: string
  link: string
  settings: Settings
  onClose: () => void
  className?: string
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
      <form.Form className={panelForm}>
        <PanelCard title="Sharing" className={props.className}>
          <form.AppField name="mode">
            {(modeField) => (
              <Select
                aria-label="Sharing mode"
                options={modes}
                value={modeField.state.value}
                onChange={(value) => modeField.handleChange(value as Mode)}
                className="min-w-48 flex-1"
              />
            )}
          </form.AppField>
          {mode === 'people' && (
            <form.AppField name="members">
              {(membersField) => (
                <membersField.TextField
                  aria-label="Handles of the people to share with, separated by commas"
                  placeholder="alice.bsky.social, bob.example.com"
                  className="min-w-48 flex-1"
                />
              )}
            </form.AppField>
          )}
          <form.SubmitButton>Save</form.SubmitButton>
          {mode !== 'private' && (
            <input
              aria-label="Link"
              readOnly
              value={props.link}
              className={cn(field, 'min-w-48 flex-1')}
            />
          )}
          <CloseButton onClose={props.onClose} />
          <ErrorAlert error={save.error} className="w-full text-small" />
        </PanelCard>
      </form.Form>
    </form.AppForm>
  )
}

interface CloseButtonProps {
  onClose: () => void
}

function CloseButton(props: CloseButtonProps) {
  return <Button onClick={props.onClose}>Close</Button>
}
