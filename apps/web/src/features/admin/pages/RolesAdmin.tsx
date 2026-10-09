import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { useRolesChanged } from '../hooks/changes.ts'
import { adminRolesQuery } from '../queries.ts'

/** A summary of every role, each linking to its page, and a form to create one. */
export function RolesAdmin() {
  const { data } = useSuspenseQuery(adminRolesQuery)
  return (
    <section>
      <h2>Roles</h2>
      <p>
        Everyone who has signed in holds the <code>user</code> role. A role's members are the people
        added to it, plus everyone whose PDS host or handle domain matches.
      </p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Description</th>
            <th>Members</th>
            <th>PDS hosts</th>
            <th>Handle domains</th>
          </tr>
        </thead>
        <tbody>
          {data.roles.map((role) => (
            <RoleRow
              key={role.name}
              role={role}
              environmentAdmins={data.environmentAdmins.length}
            />
          ))}
        </tbody>
      </table>
      <NewRoleForm />
    </section>
  )
}

interface RoleRowProps {
  role: {
    name: string
    description: string
    members: unknown[]
    pdsHosts: string[]
    handleDomains: string[]
  }
  /** How many admins the environment names, who count as members of the admin role. */
  environmentAdmins: number
}

function RoleRow(props: RoleRowProps) {
  const role = props.role
  return (
    <tr>
      <td>
        <Link to="/admin/roles/$name" params={{ name: role.name }}>
          {role.name}
        </Link>
      </td>
      <td>{role.description}</td>
      <td>{role.members.length + (role.name === 'admin' ? props.environmentAdmins : 0)}</td>
      <td>{role.pdsHosts.join(', ')}</td>
      <td>{role.handleDomains.join(', ')}</td>
    </tr>
  )
}

function NewRoleForm() {
  const rolesChanged = useRolesChanged()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (draft: { name: string; description: string }) =>
      read(api.admin.roles.$post({}, json(draft))),
    onSuccess: async (_, draft) => {
      await rolesChanged()
      await navigate({ to: '/admin/roles/$name', params: { name: draft.name } })
    },
  })
  const form = useAppForm({
    defaultValues: { name: '', description: '' },
    onSubmit: ({ value }) => create.mutate(value),
  })
  return (
    <>
      <form.AppForm>
        <form.Form>
          <h3>New role</h3>
          <form.AppField name="name">
            {(field) => <field.TextField aria-label="Role name" placeholder="name" required />}
          </form.AppField>
          <form.AppField name="description">
            {(field) => <field.TextField aria-label="Role description" placeholder="Description" />}
          </form.AppField>
          <form.SubmitButton>Create role</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      <ErrorAlert error={create.error} />
    </>
  )
}
