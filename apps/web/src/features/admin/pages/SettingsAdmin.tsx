import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { issuesOf, messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import type { Issue } from '../../../shared/response.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { SaveBar, SettingsGroup, SettingsPage } from '../../../shared/ui/SettingsPage.tsx'
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

/** What each group of settings is called on the page. */
const groupTitles: Record<string, string> = {
  general: 'App',
  sessions: 'Sessions',
  turns: 'Turns',
  sync: 'Background sync',
}

/**
 * A card of settings: one setting's fields, all of them or the ones named. A card of a single
 * nested group of fields, such as the sync safety net, holds the group's own fields, under its
 * title and description.
 */
export interface Section {
  key: string
  /** The card's heading, the setting's own name, or the group's, by default. */
  title?: string
  fields?: string[]
}

/** The schema with only the named fields, in its own order, or all of them. */
const only = (schema: Schema, fields?: string[]): Schema =>
  fields
    ? {
        ...schema,
        properties: Object.fromEntries(
          Object.entries(schema.properties ?? {}).filter(([key]) => fields.includes(key)),
        ),
      }
    : schema

interface SettingsAdminProps {
  title: string
  /** One line under the title saying what the settings are for. */
  description: string
  sections: Section[]
}

/** Some of the app's own settings, in cards chosen by the route, with one Save. */
export function SettingsAdmin(props: SettingsAdminProps) {
  const { data: settings } = useSuspenseQuery(adminSettingsQuery)
  const queryClient = useQueryClient()
  const keys = new Set(props.sections.map((section) => section.key))
  const groups: Group[] = settings.filter((group) => keys.has(group.key))
  const save = useMutation({
    mutationFn: (edited: SettingValues) => saveGroups(groups, edited),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSettingsQuery.queryKey }),
  })
  const failed = save.error instanceof GroupFailed ? save.error : null
  return (
    <SettingsPage title={props.title} description={props.description}>
      <SettingsForm
        // Start over from the stored settings whenever they change.
        key={formKey(groups)}
        groups={groups}
        sections={props.sections}
        failed={failed && { key: failed.key, issues: issuesOf(failed.cause) }}
        pending={save.isPending}
        saved={save.isSuccess}
        error={save.error && messageOf(save.error)}
        onSave={save.mutate}
        onEdit={save.reset}
      />
    </SettingsPage>
  )
}

interface SettingsFormProps {
  groups: Group[]
  sections: Section[]
  /** The group whose save failed, with the problems the server found in it. */
  failed: { key: string; issues: Issue[] } | null
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (values: SettingValues) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
}

function SettingsForm(props: SettingsFormProps) {
  // Fields are addressed by position, as in the user's plugin form.
  const form = useAppForm({
    defaultValues: { groups: props.groups.map((group) => group.value) } as SettingValues,
    listeners: { onChange: () => props.onEdit() },
    onSubmit: ({ value }) => props.onSave(value),
  })
  const issues = (key: string) => (props.failed?.key === key ? props.failed.issues : [])
  return (
    <form.AppForm>
      <form.Form>
        {props.sections.map((section) => {
          const i = props.groups.findIndex((group) => group.key === section.key)
          const group = props.groups[i]
          if (!group) return null
          const [name] = section.fields ?? []
          const nested =
            name && section.fields?.length === 1 ? group.schema.properties?.[name] : undefined
          if (name && nested?.type === 'object' && nested.properties)
            return (
              <SettingsGroup
                key={`${section.key}:${name}`}
                title={section.title ?? nested.title ?? name}
                description={nested.description}
              >
                <form.Field name={`groups[${i}]`}>
                  {(field) => (
                    <SchemaFields
                      schema={nested}
                      values={(field.state.value?.[name] ?? {}) as Record<string, unknown>}
                      issues={issues(group.key)
                        .filter((issue) => issue.path[0] === name)
                        .map((issue) => ({ ...issue, path: issue.path.slice(1) }))}
                      onChange={(key, value) =>
                        field.handleChange((current) => ({
                          ...current,
                          [name]: { ...((current?.[name] ?? {}) as object), [key]: value },
                        }))
                      }
                    />
                  )}
                </form.Field>
              </SettingsGroup>
            )
          return (
            <SettingsGroup
              key={`${section.key}:${section.title}`}
              title={section.title ?? groupTitles[section.key] ?? section.key}
            >
              <form.Field name={`groups[${i}]`}>
                {(field) => (
                  <SchemaFields
                    schema={only(group.schema, section.fields)}
                    values={field.state.value ?? {}}
                    issues={issues(group.key)}
                    onChange={(key, value) =>
                      field.handleChange((current) => ({ ...current, [key]: value }))
                    }
                  />
                )}
              </form.Field>
            </SettingsGroup>
          )
        })}
        <SaveBar pending={props.pending} saved={props.saved} error={props.error} />
      </form.Form>
    </form.AppForm>
  )
}
