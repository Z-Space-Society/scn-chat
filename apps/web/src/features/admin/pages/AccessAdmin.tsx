import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import {
  Choice,
  Choices,
  SaveBar,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { roleNames } from '../lib/roles.ts'
import { adminAccessQuery, adminRolesQuery } from '../queries.ts'

type Registration = 'open' | 'invite' | 'closed'

interface Access {
  registration: Registration
  inviteRoles: string[]
}

const modes: { mode: Registration; label: string; detail: string }[] = [
  { mode: 'open', label: 'Open', detail: 'Anyone with an atproto account can create an account.' },
  {
    mode: 'invite',
    label: 'Invite',
    detail: 'Members of the roles below, and people added on the Users page.',
  },
  { mode: 'closed', label: 'Closed', detail: 'Only people added on the Users page.' },
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
    <SettingsPage
      title="Access"
      description="Who can create an account. People who already have one keep it, until you suspend them on the Users page."
    >
      <AccessForm
        // Start over from the stored setting whenever it changes.
        key={formKey(access)}
        stored={access}
        roleNames={roleNames(roles.roles)}
        pending={save.isPending}
        saved={save.isSuccess}
        error={save.error && messageOf(save.error)}
        onSave={save.mutate}
        onEdit={save.reset}
      />
    </SettingsPage>
  )
}

interface AccessFormProps {
  stored: Access
  roleNames: string[]
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (access: Access) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
}

function AccessForm(props: AccessFormProps) {
  const form = useAppForm({
    defaultValues: props.stored,
    listeners: { onChange: () => props.onEdit() },
    onSubmit: ({ value }) => props.onSave(value),
  })
  const registration = useFormStore(form.store, (state) => state.values.registration)
  return (
    <form.AppForm>
      <form.Form>
        <form.Field name="registration">
          {(field) => (
            <Choices
              title="Registration"
              note="Admins can always sign in, and anyone can sign in from a share link to view a chat shared with them."
            >
              {modes.map((mode) => (
                <Choice
                  key={mode.mode}
                  name={field.name}
                  value={mode.mode}
                  checked={field.state.value === mode.mode}
                  onChange={() => field.handleChange(mode.mode)}
                  label={mode.label}
                  description={mode.detail}
                />
              ))}
            </Choices>
          )}
        </form.Field>
        {registration === 'invite' && (
          <SettingsGroup
            title="Invite roles"
            description="Members of these roles can create an account."
          >
            <form.Field name="inviteRoles">
              {(field) => (
                <RolePicker
                  names={props.roleNames}
                  picked={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </SettingsGroup>
        )}
        <SaveBar pending={props.pending} saved={props.saved} error={props.error} />
      </form.Form>
    </form.AppForm>
  )
}
