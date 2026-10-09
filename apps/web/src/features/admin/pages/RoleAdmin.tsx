import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { formKey } from '../../../shared/form.tsx'
import { splitLines } from '../../../shared/lines.ts'
import { useRolesChanged } from '../hooks/changes.ts'
import { adminRolesQuery } from '../queries.ts'

type Role = {
  name: string
  description: string
  builtIn: boolean
  pdsHosts: string[]
  handleDomains: string[]
  members: { did: string; handle: string | null; addedBy: string }[]
}

interface RoleAdminProps {
  name: string
}

/** One role on its own page. */
export function RoleAdmin(props: RoleAdminProps) {
  const roles = useQuery(adminRolesQuery)
  const navigate = useNavigate()
  const rolesChanged = useRolesChanged()
  const remove = useMutation({
    mutationFn: () => read(api.admin.roles[':name'].$delete({ param: { name: props.name } })),
    onSuccess: async () => {
      await navigate({ to: '/admin/roles' })
      await rolesChanged()
    },
  })
  const role = roles.data?.roles.find((candidate) => candidate.name === props.name)
  const error = remove.error ? messageOf(remove.error) : roles.error && messageOf(roles.error)
  return (
    <>
      <Link to="/admin/roles">Back to roles</Link>
      {role && (
        <RoleForm
          // Start over from the stored role whenever it changes.
          key={formKey(role)}
          role={role}
          environmentAdmins={roles.data?.environmentAdmins ?? []}
          onChange={rolesChanged}
          onRemove={() => remove.mutate()}
        />
      )}
      {roles.data && !role && <p role="alert">This role doesn't exist.</p>}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

interface RoleFormProps {
  role: Role
  environmentAdmins: string[]
  onChange: () => Promise<unknown>
  onRemove: () => void
}

/** One role's description, matching rules, and explicit members. */
function RoleForm(props: RoleFormProps) {
  const { name } = props.role
  const [identifier, setIdentifier] = useState('')
  const save = useMutation({
    mutationFn: (draft: { description: string; hosts: string; domains: string }) =>
      read(
        api.admin.roles[':name'].$patch(
          { param: { name } },
          json({
            description: draft.description,
            pdsHosts: splitLines(draft.hosts),
            handleDomains: splitLines(draft.domains),
          }),
        ),
      ),
    onSuccess: props.onChange,
  })
  const addMember = useMutation({
    mutationFn: (identifier: string) =>
      read(api.admin.roles[':name'].members.$post({ param: { name } }, json({ identifier }))),
    onSuccess: () => {
      setIdentifier('')
      return props.onChange()
    },
  })
  const removeMember = useMutation({
    mutationFn: (did: string) =>
      read(api.admin.roles[':name'].members[':did'].$delete({ param: { name, did } })),
    onSuccess: props.onChange,
  })
  const form = useForm({
    defaultValues: {
      description: props.role.description,
      hosts: props.role.pdsHosts.join('\n'),
      domains: props.role.handleDomains.join('\n'),
    },
    onSubmit: ({ value }) => save.mutate(value),
  })
  const error = lastError(save, addMember, removeMember)
  return (
    <section>
      <h2>{name}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="description">
          {(field) => (
            <label>
              Description{' '}
              <input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="hosts">
          {(field) => (
            <label>
              PDS hosts, one per line
              <textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="domains">
          {(field) => (
            <label>
              Handle domains, one per line
              <textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </label>
          )}
        </form.Field>
        <button type="submit">Save</button>
      </form>
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
      <form
        onSubmit={(e) => {
          e.preventDefault()
          addMember.mutate(identifier)
        }}
      >
        <input
          aria-label={`Add a member to ${name}`}
          placeholder="Handle or DID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
        />
        <button type="submit">Add member</button>
      </form>
      {!props.role.builtIn && (
        <button type="button" onClick={props.onRemove}>
          Delete role
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
