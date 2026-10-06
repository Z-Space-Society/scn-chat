import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { RolePicker } from '../components/RolePicker.tsx'
import { adminApiKeysQuery, adminRolesQuery } from '../queries.ts'

/** Issue and revoke the keys that scripts, such as a crontab, send as a Bearer token. */
export function ApiKeysAdmin() {
  const keys = useQuery(adminApiKeysQuery)
  const roles = useQuery(adminRolesQuery)
  const queryClient = useQueryClient()
  const keysChanged = () => queryClient.invalidateQueries({ queryKey: adminApiKeysQuery.queryKey })
  const issue = useMutation({
    mutationFn: (draft: { label: string; roles: string[] }) =>
      read(api.admin['api-keys'].$post({}, json(draft))),
    onSuccess: () => {
      form.reset()
      return keysChanged()
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => read(api.admin['api-keys'][':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  const form = useForm({
    defaultValues: { label: '', roles: [] as string[] },
    onSubmit: ({ value }) => issue.mutate(value),
  })
  const roleNames = ['user', ...(roles.data?.roles ?? []).map((role) => role.name)]
  const loadError = keys.error ?? roles.error
  const error = lastError(issue, revoke) ?? (loadError && messageOf(loadError))
  return (
    <section>
      <h2>API keys</h2>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Roles</th>
            <th>Created</th>
            <th>Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(keys.data ?? []).map((key) => (
            <tr key={key.id}>
              <td>{key.label}</td>
              <td>{key.roles.join(', ')}</td>
              <td>
                <ClientOnly>{new Date(key.createdAt).toLocaleString()}</ClientOnly>
              </td>
              <td>
                <ClientOnly>
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                </ClientOnly>
              </td>
              <td>
                <button type="button" onClick={() => revoke.mutate(key.id)}>
                  Revoke
                </button>
              </td>
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
        <h3>New key</h3>
        <form.Field name="label">
          {(field) => (
            <input
              aria-label="Key label"
              placeholder="Label"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            />
          )}
        </form.Field>
        <fieldset>
          <legend>Roles</legend>
          <form.Field name="roles">
            {(field) => (
              <RolePicker
                names={roleNames}
                picked={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </fieldset>
        <button type="submit">Issue key</button>
      </form>
      {issue.data && (
        <p>
          Copy this key now. It can't be shown again: <code>{issue.data.key}</code>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
