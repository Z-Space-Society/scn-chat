import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ClientOnly } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { useAppForm } from '../../../shared/form.tsx'
import { timeAgo } from '../../../shared/time.ts'
import * as ItemList from '../../../shared/ui/ItemList.tsx'
import { Secret } from '../../../shared/ui/Secret.tsx'
import {
  AddBar,
  Callout,
  ConfirmButton,
  cardAlert,
  type SaveState,
  SettingRow,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { rolesWithUser } from '../lib/roles.ts'
import { type AdminApiKey, adminApiKeysQuery, adminRolesQuery } from '../queries.ts'

/** Issue and revoke the keys that scripts, such as a crontab, send as a Bearer token. */
export function ApiKeysAdmin() {
  const keysChanged = useKeysChanged()
  const issue = useMutation({
    mutationFn: (draft: { label: string; roles: string[] }) =>
      read(api.admin['api-keys'].$post({}, json(draft))),
    onSuccess: keysChanged,
  })
  return (
    <SettingsPage
      title="API keys"
      description="Keys that scripts, such as a crontab, send as a Bearer token. A key acts with the roles you give it."
    >
      {issue.data && (
        <Callout tone="good">
          <strong className="font-semibold">Copy this key now. It can't be shown again.</strong>
          <Secret text={issue.data.key} />
        </Callout>
      )}
      <SettingsGroup title="Keys">
        <ApiKeyList />
      </SettingsGroup>
      <IssueKeyForm
        issuing={issue}
        onIssue={(draft, issued) => issue.mutate(draft, { onSuccess: issued })}
      />
    </SettingsPage>
  )
}

function useKeysChanged() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: adminApiKeysQuery.queryKey })
}

/** The issued keys with their roles and use, each with a way to revoke it. */
function ApiKeyList() {
  const { data: keys } = useSuspenseQuery(adminApiKeysQuery)
  const keysChanged = useKeysChanged()
  const revoke = useMutation({
    mutationFn: (id: string) => read(api.admin['api-keys'][':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  if (!keys.length) return <SettingsEmpty>No keys yet.</SettingsEmpty>
  return (
    <>
      <ItemList.Root>
        {keys.map((key) => (
          <ApiKeyRow key={key.id} apiKey={key} onRevoke={() => revoke.mutate(key.id)} />
        ))}
      </ItemList.Root>
      <ErrorAlert error={revoke.error} className={cardAlert} />
    </>
  )
}

interface ApiKeyRowProps {
  apiKey: AdminApiKey
  onRevoke: () => void
}

function ApiKeyRow(props: ApiKeyRowProps) {
  const key = props.apiKey
  return (
    <ItemList.Item>
      <ItemList.Names
        title={key.label}
        details={[
          key.roles.length ? `For ${key.roles.join(', ')}` : 'No roles',
          // In the browser's locale and time zone, which the server rendering the page lacks.
          <ClientOnly key="created">
            <time dateTime={key.createdAt} title={new Date(key.createdAt).toLocaleString()}>
              Created{' '}
              {new Date(key.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </time>
          </ClientOnly>,
          <ClientOnly key="used">
            <LastUsed date={key.lastUsedAt} />
          </ClientOnly>,
        ]}
      />
      <ConfirmButton
        label="Revoke"
        question={`Revoke ${key.label}? Scripts using it stop working.`}
        onConfirm={props.onRevoke}
        tone="quiet"
      />
    </ItemList.Item>
  )
}

interface LastUsedProps {
  date: string | null
}

function LastUsed(props: LastUsedProps) {
  if (!props.date) return 'Never used'
  return (
    <time dateTime={props.date} title={new Date(props.date).toLocaleString()}>
      Last used {timeAgo(new Date(props.date))}
    </time>
  )
}

interface IssueKeyFormProps {
  issuing: SaveState
  /** Issue a key, calling `issued` once it is, so the form can start over. */
  onIssue: (draft: { label: string; roles: string[] }, issued: () => void) => void
}

function IssueKeyForm(props: IssueKeyFormProps) {
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const form = useAppForm({
    defaultValues: { label: '', roles: [] as string[] },
    onSubmit: ({ value, formApi }) => props.onIssue(value, () => formApi.reset()),
  })
  return (
    <form.AppForm>
      <form.Form>
        <SettingsGroup title="New key">
          <form.AppField name="label">
            {(field) => (
              <SettingRow
                label="Label"
                htmlFor="key-label"
                description="What will use the key, so you know which to revoke."
              >
                <field.TextField id="key-label" placeholder="crontab" required />
              </SettingRow>
            )}
          </form.AppField>
          <SettingRow
            label="Roles"
            description={
              <>
                What the key may do. Cron needs <code>admin</code>.
              </>
            }
            wide
          >
            <form.Field name="roles">
              {(field) => (
                <RolePicker
                  names={rolesWithUser(roles.roles)}
                  picked={field.state.value}
                  onChange={field.handleChange}
                  className="p-0"
                />
              )}
            </form.Field>
          </SettingRow>
        </SettingsGroup>
        <AddBar label="Issue key" adding={props.issuing} />
      </form.Form>
    </form.AppForm>
  )
}
