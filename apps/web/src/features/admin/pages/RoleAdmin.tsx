import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { splitLines } from '../../../shared/lines.ts'
import { useRolesChanged } from '../hooks/changes.ts'
import { type AdminRole, adminRolesQuery } from '../queries.ts'

interface RoleAdminProps {
  name: string
}

/** One role on its own page. */
export function RoleAdmin(props: RoleAdminProps) {
  const { data } = useSuspenseQuery(adminRolesQuery)
  const navigate = useNavigate()
  const rolesChanged = useRolesChanged()
  const remove = useMutation({
    mutationFn: () => read(api.admin.roles[':name'].$delete({ param: { name: props.name } })),
    // Leave first, so the page doesn't say the role it just deleted doesn't exist.
    onSuccess: async () => {
      await navigate({ to: '/admin/roles' })
      await rolesChanged()
    },
  })
  return (
    <>
      <Link to="/admin/roles">Back to roles</Link>
      <RoleDetails
        role={data.roles.find((candidate) => candidate.name === props.name)}
        environmentAdmins={data.environmentAdmins}
        onRemove={() => remove.mutate()}
      />
      <ErrorAlert error={remove.error} />
    </>
  )
}

interface RoleDetailsProps {
  role: AdminRole | undefined
  environmentAdmins: string[]
  onRemove: () => void
}

/** A role's description, matching rules, and members, or that it doesn't exist. */
function RoleDetails(props: RoleDetailsProps) {
  if (!props.role) return <p role="alert">This role doesn't exist.</p>
  return (
    <RoleSection
      role={props.role}
      environmentAdmins={props.environmentAdmins}
      onRemove={props.onRemove}
    />
  )
}

interface RoleSectionProps extends RoleDetailsProps {
  role: AdminRole
}

function RoleSection(props: RoleSectionProps) {
  const rolesChanged = useRolesChanged()
  const save = useMutation({
    mutationFn: (draft: { description: string; hosts: string; domains: string }) =>
      read(
        api.admin.roles[':name'].$patch(
          { param: { name: props.role.name } },
          json({
            description: draft.description,
            pdsHosts: splitLines(draft.hosts),
            handleDomains: splitLines(draft.domains),
          }),
        ),
      ),
    onSuccess: rolesChanged,
  })
  return (
    <section>
      <h2>{props.role.name}</h2>
      <RoleForm
        // Start over from the stored role whenever it changes.
        key={formKey(props.role)}
        role={props.role}
        onSave={save.mutate}
      />
      <ErrorAlert error={save.error} />
      <RoleMembers role={props.role} environmentAdmins={props.environmentAdmins} />
      {!props.role.builtIn && (
        <button type="button" onClick={props.onRemove}>
          Delete role
        </button>
      )}
    </section>
  )
}

interface RoleFormProps {
  role: AdminRole
  onSave: (draft: { description: string; hosts: string; domains: string }) => void
}

/** A role's description, and the PDS hosts and handle domains whose accounts it matches. */
function RoleForm(props: RoleFormProps) {
  const form = useAppForm({
    defaultValues: {
      description: props.role.description,
      hosts: props.role.pdsHosts.join('\n'),
      domains: props.role.handleDomains.join('\n'),
    },
    onSubmit: ({ value }) => props.onSave(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="description">
          {(field) => <field.TextField label="Description" />}
        </form.AppField>
        <form.AppField name="hosts">
          {(field) => <field.TextAreaField label="PDS hosts, one per line" />}
        </form.AppField>
        <form.AppField name="domains">
          {(field) => <field.TextAreaField label="Handle domains, one per line" />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  )
}

interface RoleMembersProps {
  role: AdminRole
  environmentAdmins: string[]
}

/** A role's explicit members, and the admins the environment names for the admin role. */
function RoleMembers(props: RoleMembersProps) {
  const name = props.role.name
  const rolesChanged = useRolesChanged()
  const addMember = useMutation({
    mutationFn: (identifier: string) =>
      read(api.admin.roles[':name'].members.$post({ param: { name } }, json({ identifier }))),
    onSuccess: rolesChanged,
  })
  const removeMember = useMutation({
    mutationFn: (did: string) =>
      read(api.admin.roles[':name'].members[':did'].$delete({ param: { name, did } })),
    onSuccess: rolesChanged,
  })
  const form = useAppForm({
    defaultValues: { identifier: '' },
    onSubmit: ({ value, formApi }) =>
      addMember.mutate(value.identifier, { onSuccess: () => formApi.reset() }),
  })
  return (
    <>
      <h3>Members</h3>
      <ul>
        {name === 'admin' &&
          props.environmentAdmins.map((did) => <li key={did}>{did} (from ADMIN_DIDS)</li>)}
        {props.role.members.map((member) => (
          <li key={member.did}>
            {member.handle ? `${member.handle} ` : ''}
            {member.did} (added by {member.addedBy}){' '}
            <button type="button" onClick={() => removeMember.mutate(member.did)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form.AppForm>
        <form.Form>
          <form.AppField name="identifier">
            {(field) => (
              <field.TextField
                aria-label={`Add a member to ${name}`}
                placeholder="Handle or DID"
                required
              />
            )}
          </form.AppField>
          <form.SubmitButton>Add member</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <ErrorAlert error={lastError(addMember, removeMember)} />
    </>
  )
}
