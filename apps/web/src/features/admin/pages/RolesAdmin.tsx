import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { adminRolesQuery } from '../queries.ts'

/** A summary of every role, each linking to its page, and a form to create one. */
export function RolesAdmin() {
  const roles = useQuery(adminRolesQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (draft: { name: string; description: string }) =>
      read(api.admin.roles.$post({}, json(draft))),
    onSuccess: async (_, draft) => {
      await queryClient.invalidateQueries({ queryKey: adminRolesQuery.queryKey })
      await navigate({ to: '/admin/roles/$name', params: { name: draft.name } })
    },
  })
  const form = useForm({
    defaultValues: { name: '', description: '' },
    onSubmit: ({ value }) => create.mutate(value),
  })
  const environmentAdmins = roles.data?.environmentAdmins ?? []
  const error = create.error ? messageOf(create.error) : roles.error && messageOf(roles.error)
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
          {(roles.data?.roles ?? []).map((role) => (
            <tr key={role.name}>
              <td>
                <Link to="/admin/roles/$name" params={{ name: role.name }}>
                  {role.name}
                </Link>
              </td>
              <td>{role.description}</td>
              <td>
                {role.members.length + (role.name === 'admin' ? environmentAdmins.length : 0)}
              </td>
              <td>{role.pdsHosts.join(', ')}</td>
              <td>{role.handleDomains.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
