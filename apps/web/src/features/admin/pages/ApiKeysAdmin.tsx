import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { LocalTime } from '../../../shared/LocalTime.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { rolesWithUser } from '../lib/roles.ts'
import { adminApiKeysQuery, adminRolesQuery } from '../queries.ts'

/** Issue and revoke the keys that scripts, such as a crontab, send as a Bearer token. */
export function ApiKeysAdmin() {
  return (
    <section>
      <h2>API keys</h2>
      <ApiKeyTable />
      <IssueKeyForm />
    </section>
  )
}

function useKeysChanged() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: adminApiKeysQuery.queryKey })
}

function ApiKeyTable() {
  const { data: keys } = useSuspenseQuery(adminApiKeysQuery)
  const keysChanged = useKeysChanged()
  const revoke = useMutation({
    mutationFn: (id: string) => read(api.admin['api-keys'][':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  return (
    <>
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
          {keys.map((key) => (
            <ApiKeyRow key={key.id} apiKey={key} onRevoke={() => revoke.mutate(key.id)} />
          ))}
        </tbody>
      </table>
      <ErrorAlert error={revoke.error} />
    </>
  )
}

interface ApiKeyRowProps {
  apiKey: { label: string; roles: string[]; createdAt: string; lastUsedAt: string | null }
  onRevoke: () => void
}

function ApiKeyRow(props: ApiKeyRowProps) {
  return (
    <tr>
      <td>{props.apiKey.label}</td>
      <td>{props.apiKey.roles.join(', ')}</td>
      <td>
        <LocalTime date={props.apiKey.createdAt} />
      </td>
      <td>
        <LocalTime date={props.apiKey.lastUsedAt} fallback="Never" />
      </td>
      <td>
        <button type="button" onClick={props.onRevoke}>
          Revoke
        </button>
      </td>
    </tr>
  )
}

function IssueKeyForm() {
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const keysChanged = useKeysChanged()
  const issue = useMutation({
    mutationFn: (draft: { label: string; roles: string[] }) =>
      read(api.admin['api-keys'].$post({}, json(draft))),
    onSuccess: keysChanged,
  })
  const form = useAppForm({
    defaultValues: { label: '', roles: [] as string[] },
    onSubmit: ({ value, formApi }) => issue.mutate(value, { onSuccess: () => formApi.reset() }),
  })
  return (
    <>
      <form.AppForm>
        <form.Form>
          <h3>New key</h3>
          <form.AppField name="label">
            {(field) => <field.TextField aria-label="Key label" placeholder="Label" required />}
          </form.AppField>
          <fieldset>
            <legend>Roles</legend>
            <form.Field name="roles">
              {(field) => (
                <RolePicker
                  names={rolesWithUser(roles.roles)}
                  picked={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </fieldset>
          <form.SubmitButton>Issue key</form.SubmitButton>
        </form.Form>
      </form.AppForm>
      {issue.data && (
        <p>
          Copy this key now. It can't be shown again: <code>{issue.data.key}</code>
        </p>
      )}
      <ErrorAlert error={issue.error} />
    </>
  )
}
