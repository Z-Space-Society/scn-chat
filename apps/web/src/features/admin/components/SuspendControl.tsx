import { useState } from 'react'
import { useAppForm } from '../../../shared/form.tsx'
import { Badge } from '../../../shared/ui/Badge.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import type { AdminUser } from '../queries.ts'

interface Props {
  /** The account's handle, or its DID without one. */
  name: string
  suspension: AdminUser['suspension']
  onSuspend: (reason: string) => void
  onRestore: () => void
}

/**
 * Access at the end of an account's row, which drops under its details in a narrow column, in line
 * with them.
 */
const access =
  'mt-0.5 inline-flex flex-none items-start gap-2 @max-narrow:mt-0 @max-narrow:basis-full @max-narrow:ps-11.5'

/**
 * Whether an account may use the app: Suspended, with who did it and why cut short under it, and
 * Restore, or Active with Suspend, which asks for a reason across the row first.
 */
export function SuspendControl(props: Props) {
  const [suspending, setSuspending] = useState(false)
  if (props.suspension) {
    const by = `By ${props.suspension.by}`
    const note = props.suspension.reason ? `${props.suspension.reason} · ${by}` : by
    return (
      <span className={access}>
        <span className="flex flex-col @max-narrow:items-start items-end gap-0.5">
          <Badge tone="danger" className="mt-1.25">
            Suspended
          </Badge>
          <small title={note} className="max-w-40 truncate text-muted text-small">
            {note}
          </small>
        </span>
        <Button tone="quiet" onClick={props.onRestore}>
          Restore
        </Button>
      </span>
    )
  }
  if (!suspending)
    return (
      <span className={access}>
        <Badge tone="good" className="mt-1.25">
          Active
        </Badge>
        <Button tone="quiet" onClick={() => setSuspending(true)}>
          Suspend
        </Button>
      </span>
    )
  return (
    <SuspendForm
      name={props.name}
      onCancel={() => setSuspending(false)}
      onSuspend={(reason) => {
        setSuspending(false)
        props.onSuspend(reason)
      }}
    />
  )
}

interface SuspendFormProps {
  name: string
  onCancel: () => void
  onSuspend: (reason: string) => void
}

/** Asking for a reason, across the row under the account's details. */
function SuspendForm(props: SuspendFormProps) {
  const form = useAppForm({
    defaultValues: { reason: '' },
    onSubmit: ({ value }) => props.onSuspend(value.reason),
  })
  return (
    <form.AppForm>
      <form.Form className="flex basis-full flex-wrap gap-1.5 ps-11.5">
        <form.AppField name="reason">
          {(field) => (
            <field.TextField
              aria-label={`Reason for suspending ${props.name}`}
              placeholder="Reason, seen only by admins"
              className="min-w-0 grow basis-48"
              // The field appears because Suspend was just clicked.
              autoFocus
            />
          )}
        </form.AppField>
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" tone="danger">
          Suspend
        </Button>
      </form.Form>
    </form.AppForm>
  )
}
