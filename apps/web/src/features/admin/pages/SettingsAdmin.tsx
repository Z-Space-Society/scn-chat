import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { issuesOf, messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import type { Issue } from '../../../shared/response.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { adminSettingsQuery } from '../queries.ts'

interface Group {
  key: string
  schema: Schema
  value: Record<string, unknown>
}

/** The form's values: each group's settings, by position. */
interface SettingValues {
  groups: Record<string, unknown>[]
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

/** Save each group in turn, so a failure names the group its issues belong to. */
async function saveGroups(groups: Group[], edited: SettingValues) {
  for (const [i, group] of groups.entries()) {
    try {
      await read(
        api.admin.settings[':key'].$put(
          { param: { key: group.key } },
          json(edited.groups[i] ?? {}),
        ),
      )
    } catch (err) {
      throw new GroupFailed(group.key, err)
    }
  }
}

interface SettingsAdminProps {
  title: string
  keys: string[]
}

/** Some of the app's own settings, as forms generated from their schemas, with one Save. */
export function SettingsAdmin(props: SettingsAdminProps) {
  const { data: settings } = useSuspenseQuery(adminSettingsQuery)
  const queryClient = useQueryClient()
  const groups: Group[] = settings.filter((group) => props.keys.includes(group.key))
  const save = useMutation({
    mutationFn: (edited: SettingValues) => saveGroups(groups, edited),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSettingsQuery.queryKey }),
  })
  const failed = save.error instanceof GroupFailed ? save.error : null
  return (
    <section>
      <h2>{props.title}</h2>
      <SettingsForm
        // Start over from the stored settings whenever they change.
        key={formKey(groups)}
        groups={groups}
        failed={failed && { key: failed.key, issues: issuesOf(failed.cause) }}
        saved={save.isSuccess}
        onSave={save.mutate}
      />
      <ErrorAlert error={save.error} />
    </section>
  )
}

interface SettingsFormProps {
  groups: Group[]
  /** The group whose save failed, with the problems the server found in it. */
  failed: { key: string; issues: Issue[] } | null
  saved: boolean
  onSave: (values: SettingValues) => void
}

function SettingsForm(props: SettingsFormProps) {
  // Fields are addressed by position, as in the user's plugin form.
  const form = useAppForm({
    defaultValues: { groups: props.groups.map((group) => group.value) } as SettingValues,
    onSubmit: ({ value }) => props.onSave(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        {props.groups.map((group, i) => (
          <fieldset key={group.key}>
            <form.Field name={`groups[${i}]`}>
              {(field) => (
                <SchemaFields
                  schema={group.schema}
                  values={field.state.value ?? {}}
                  issues={props.failed?.key === group.key ? props.failed.issues : []}
                  onChange={(key, value) =>
                    field.handleChange((current) => ({ ...current, [key]: value }))
                  }
                />
              )}
            </form.Field>
          </fieldset>
        ))}
        <form.SubmitButton>Save</form.SubmitButton>
        {props.saved && <span>Saved.</span>}
      </form.Form>
    </form.AppForm>
  )
}
