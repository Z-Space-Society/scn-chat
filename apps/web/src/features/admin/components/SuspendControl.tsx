import { useAppForm } from '../../../shared/form.tsx'
import type { AdminUser } from '../queries.ts'

interface Props {
  /** The account's handle, or its DID without one. */
  name: string
  suspension: AdminUser['suspension']
  onSuspend: (reason: string) => void
  onRestore: () => void
}

/** Who suspended an account and why, with Restore, or a form to suspend it. */
export function SuspendControl(props: Props) {
  if (props.suspension)
    return (
      <>
        Suspended by {props.suspension.by}
        {props.suspension.reason && `: ${props.suspension.reason}`}{' '}
        <button type="button" onClick={props.onRestore}>
          Restore
        </button>
      </>
    )
  return <SuspendForm name={props.name} onSuspend={props.onSuspend} />
}

interface SuspendFormProps {
  name: string
  onSuspend: (reason: string) => void
}

function SuspendForm(props: SuspendFormProps) {
  const form = useAppForm({
    defaultValues: { reason: '' },
    onSubmit: ({ value }) => props.onSuspend(value.reason),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="reason">
          {(field) => (
            <field.TextField
              aria-label={`Reason for suspending ${props.name}`}
              placeholder="Reason, seen only by admins"
            />
          )}
        </form.AppField>
        <form.SubmitButton>Suspend</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  )
}
