import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { roleNames } from '../lib/roles.ts'
import { adminAccessQuery, adminRolesQuery } from '../queries.ts'

type Registration = 'open' | 'invite' | 'closed'

interface Access {
  registration: Registration
  inviteRoles: string[]
}

const modes: { mode: Registration; label: string }[] = [
  { mode: 'open', label: 'Open: anyone with an atproto account can create an account.' },
  {
    mode: 'invite',
    label: 'Invite: members of the roles below, and people added on the Users page.',
  },
  { mode: 'closed', label: 'Closed: only people added on the Users page.' },
]

/** Who can create an account. */
export function AccessAdmin() {
  const { data: access } = useSuspenseQuery(adminAccessQuery)
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (value: Access) => read(api.admin.access.$put({}, json(value))),
    onSuccess: (saved) => queryClient.setQueryData(adminAccessQuery.queryKey, saved),
  })
  return (
    <section>
      <h2>Access</h2>
      <AccessForm
        // Start over from the stored setting whenever it changes.
        key={formKey(access)}
        stored={access}
        roleNames={roleNames(roles.roles)}
        saved={save.isSuccess}
        onSave={save.mutate}
      />
      <ErrorAlert error={save.error} />
    </section>
  )
}

interface AccessFormProps {
  stored: Access
  roleNames: string[]
  saved: boolean
  onSave: (access: Access) => void
}

function AccessForm(props: AccessFormProps) {
  const form = useAppForm({
    defaultValues: props.stored,
    onSubmit: ({ value }) => props.onSave(value),
  })
  const registration = useFormStore(form.store, (state) => state.values.registration)
  return (
    <form.AppForm>
      <form.Form>
        <p>
          Who can create an account. People who already have one keep it, until you suspend them on
          the Users page. Admins can always sign in, and anyone can sign in from a share link to
          view a chat shared with them.
        </p>
        <form.Field name="registration">
          {(field) =>
            modes.map(({ mode, label }) => (
              <label key={mode}>
                <input
                  type="radio"
                  name={field.name}
                  checked={field.state.value === mode}
                  onChange={() => field.handleChange(mode)}
                />{' '}
                {label}
              </label>
            ))
          }
        </form.Field>
        {registration === 'invite' && (
          <fieldset>
            <legend>Invite roles</legend>
            <form.Field name="inviteRoles">
              {(field) => (
                <RolePicker
                  names={props.roleNames}
                  picked={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </fieldset>
        )}
        <form.SubmitButton>Save</form.SubmitButton>
        {props.saved && <span>Saved.</span>}
      </form.Form>
    </form.AppForm>
  )
}
