import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { issuesOf, messageOf } from '../../../shared/errors.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { adminSettingsQuery } from '../queries.ts'

type Group = { key: string; schema: Schema; value: Record<string, unknown> }

/** The form's values: each group's settings, by position. */
type SettingValues = { groups: Record<string, unknown>[] }

interface SettingsAdminProps {
  title: string
  keys: string[]
}

/** Some of the app's own settings, as forms generated from their schemas, with one Save. */
export function SettingsAdmin(props: SettingsAdminProps) {
  const query = useQuery(adminSettingsQuery)
  const queryClient = useQueryClient()
  const groups: Group[] = (query.data ?? []).filter((group) => props.keys.includes(group.key))
  const save = useMutation({
    // One group at a time, so a failure names the group its issues belong to.
    mutationFn: async ({ groups: edited }: SettingValues) => {
      for (const [i, group] of groups.entries()) {
        try {
          await read(
            api.admin.settings[':key'].$put({ param: { key: group.key } }, json(edited[i] ?? {})),
          )
        } catch (err) {
          throw new GroupFailed(group.key, err)
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSettingsQuery.queryKey }),
  })
  const failed = save.error instanceof GroupFailed ? save.error : null
  const error = save.error ? messageOf(save.error) : query.error && messageOf(query.error)
  if (!query.data && error) return <p role="alert">{error}</p>
  if (!query.data) return null
  return (
    <section>
      <h2>{props.title}</h2>
      <SettingsForm
        groups={groups}
        issues={(key) => (failed?.key === key ? issuesOf(failed.cause) : [])}
        saved={save.isSuccess}
        onSave={save.mutate}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

/** A failed save of one group, keeping the server's error and its issues. */
class GroupFailed extends Error {
  readonly key: string

  constructor(key: string, cause: unknown) {
    super(messageOf(cause), { cause })
    this.name = 'GroupFailed'
    this.key = key
  }
}

interface SettingsFormProps {
  groups: Group[]
  issues: (key: string) => ReturnType<typeof issuesOf>
  saved: boolean
  onSave: (values: SettingValues) => void
}

function SettingsForm(props: SettingsFormProps) {
  // Fields are addressed by position, as in the user's plugin form.
  const form = useForm({
    defaultValues: { groups: props.groups.map((group) => group.value) } as SettingValues,
    onSubmit: ({ value }) => props.onSave(value),
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {props.groups.map((group, i) => (
        <fieldset key={group.key}>
          <form.Field name={`groups[${i}]`}>
            {(field) => (
              <SchemaFields
                schema={group.schema}
                values={field.state.value ?? {}}
                issues={props.issues(group.key)}
                onChange={(key, value) =>
                  field.handleChange((current) => ({ ...current, [key]: value }))
                }
              />
            )}
          </form.Field>
        </fieldset>
      ))}
      <button type="submit">Save</button>
      {props.saved && <span>Saved.</span>}
    </form>
  )
}
