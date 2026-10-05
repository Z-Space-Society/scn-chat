import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { adminRolesQuery } from '../queries.ts'

type Role = {
  name: string
  description: string
  builtIn: boolean
  pdsHosts: string[]
  handleDomains: string[]
  members: { did: string; handle: string | null }[]
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** Every role with its members and matching rules, and a form to create one. */
export function RolesAdmin() {
  const roles = useQuery(adminRolesQuery)
  const queryClient = useQueryClient()
  // A role's members show on the users page too.
  const rolesChanged = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminRolesQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ])
  const create = useMutation({
    mutationFn: (draft: { name: string; description: string }) =>
      read(api.admin.roles.$post({}, json(draft))),
    onSuccess: () => {
      form.reset()
      return rolesChanged()
    },
  })
  const form = useForm({
    defaultValues: { name: '', description: '' },
    onSubmit: ({ value }) => create.mutate(value),
  })
  const error = create.error ? messageOf(create.error) : roles.error && messageOf(roles.error)
  return (
    <section>
      <h2>Roles</h2>
      <p>
        Everyone who has signed in holds the <code>user</code> role. A role's members are the people
        added here, plus everyone whose PDS host or handle domain matches.
      </p>
      {(roles.data?.roles ?? []).map((role) => (
        <RoleBlock
          // Start over from the stored role whenever it changes.
          key={`${role.name}:${JSON.stringify(role)}`}
          role={role}
          environmentAdmins={roles.data?.environmentAdmins ?? []}
          onChange={rolesChanged}
        />
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <h3>New role</h3>
        <form.Field name="name">
          {(field) => (
            <input
              aria-label="Role name"
              placeholder="name"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <input
              aria-label="Role description"
              placeholder="Description"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
        <button type="submit">Create role</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

interface Props {
  role: Role
  environmentAdmins: string[]
  onChange: () => Promise<unknown>
}

/** One role's description, matching rules, and explicit members. */
function RoleBlock(props: Props) {
  const { name } = props.role
  const [identifier, setIdentifier] = useState('')
  const save = useMutation({
    mutationFn: (draft: { description: string; hosts: string; domains: string }) =>
      read(
        api.admin.roles[':name'].$patch(
          { param: { name } },
          json({
            description: draft.description,
            pdsHosts: lines(draft.hosts),
            handleDomains: lines(draft.domains),
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
  const remove = useMutation({
    mutationFn: () => read(api.admin.roles[':name'].$delete({ param: { name } })),
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
  const error = lastError(save, addMember, removeMember, remove)
  return (
    <fieldset>
      <legend>{name}</legend>
      <form.Field name="description">
        {(field) => (
          <label>
            Description{' '}
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
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
      <button type="button" onClick={() => void form.handleSubmit()}>
        Save
      </button>
      <h4>Members</h4>
      <ul>
        {name === 'admin' &&
          props.environmentAdmins.map((did) => <li key={did}>{did} (from ADMIN_DIDS)</li>)}
        {props.role.members.map((member) => (
          <li key={member.did}>
            {member.handle ? `${member.handle} ` : ''}
            {member.did}{' '}
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
        <button type="button" onClick={() => remove.mutate()}>
          Delete role
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}
