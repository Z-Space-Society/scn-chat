import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { RolePicker } from '../components/RolePicker.tsx'
import { adminAccessQuery, adminRolesQuery } from '../queries.ts'

type Registration = 'open' | 'invite' | 'closed'
type Access = { registration: Registration; inviteRoles: string[] }

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
  const access = useQuery(adminAccessQuery)
  const roles = useQuery(adminRolesQuery)
  // The form only renders once the stored setting loads, and starts from it.
  if (!access.data && access.error) return <p role="alert">{messageOf(access.error)}</p>
  if (!access.data) return null
  return (
    <AccessForm
      initial={access.data}
      roleNames={(roles.data?.roles ?? []).map((role) => role.name)}
    />
  )
}

interface Props {
  initial: Access
  roleNames: string[]
}

function AccessForm(props: Props) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (value: Access) => read(api.admin.access.$put({}, json(value))),
    onSuccess: (saved) => queryClient.setQueryData(adminAccessQuery.queryKey, saved),
  })
  const form = useForm({
    defaultValues: props.initial,
    onSubmit: ({ value }) => save.mutate(value),
  })
  const registration = useFormStore(form.store, (state) => state.values.registration)
  return (
    <section>
      <h2>Access</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
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
        <button type="submit">Save</button>
        {save.isSuccess && <span>Saved.</span>}
      </form>
      {save.error && <p role="alert">{messageOf(save.error)}</p>}
    </section>
  )
}
