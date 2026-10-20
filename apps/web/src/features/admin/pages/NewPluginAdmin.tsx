import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { issuesOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { ArrowLeftIcon } from '../../../shared/icons.tsx'
import { SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { Select } from '../../../shared/ui/Select.tsx'
import {
  AddBar,
  backLink,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { usePluginsChanged } from '../hooks/changes.ts'
import { adminInstalledQuery, adminPluginsQuery } from '../queries.ts'

interface Draft {
  package: string
  options: Record<string, unknown>
}

/** Pick an installed package, fill in its options, and add it. */
export function NewPluginAdmin() {
  const { data: plugins } = useSuspenseQuery(adminPluginsQuery)
  const { data: installed } = useSuspenseQuery(adminInstalledQuery)
  const navigate = useNavigate()
  const pluginsChanged = usePluginsChanged()
  const add = useMutation({
    mutationFn: (draft: Draft) => read(api.admin.plugins.$post({}, json(draft))),
    onSuccess: async ({ id }) => {
      await pluginsChanged()
      await navigate({ to: '/admin/plugins/$id', params: { id } })
    },
  })
  const form = useAppForm({
    defaultValues: { package: '', options: {} } as Draft,
    onSubmit: ({ value }) => add.mutate(value),
  })
  const picked = useFormStore(form.store, (state) => state.values.package)
  const added = new Set(plugins.map((instance) => instance.package))
  const available = installed.filter((p) => p.multiple || !added.has(p.package))
  const plugin = available.find((p) => p.package === picked)
  const issues = issuesOf(add.error)
  return (
    <SettingsPage
      title="Add plugin"
      description="Pick an installed package and fill in its options. You can change them later on its page."
      back={
        <Link to="/admin/plugins" className={backLink}>
          <ArrowLeftIcon /> Plugins
        </Link>
      }
    >
      <form.AppForm>
        <form.Form>
          <SettingsGroup title="Package">
            <form.Field
              name="package"
              listeners={{ onChange: () => form.setFieldValue('options', {}) }}
            >
              {(field) => (
                <SettingRow
                  label="Plugin package"
                  htmlFor="plugin-package"
                  description={
                    plugin?.description ??
                    'Packages are installed as dependencies of the app, outside the admin area.'
                  }
                >
                  <Select
                    id="plugin-package"
                    options={available.map((p) => ({ value: p.package, label: p.package }))}
                    value={field.state.value}
                    placeholder="Choose a plugin"
                    onChange={field.handleChange}
                  />
                </SettingRow>
              )}
            </form.Field>
          </SettingsGroup>
          {plugin && Object.keys(plugin.schema.properties ?? {}).length > 0 && (
            <SettingsGroup title="Options">
              <form.Field name="options">
                {(field) => (
                  <SchemaFields
                    // Another package's fields start over, as its options do. A list field keeps
                    // its own text, which would otherwise carry over to a field of the same name.
                    key={plugin.package}
                    schema={plugin.schema}
                    values={field.state.value}
                    secrets={{ fields: plugin.secretFields }}
                    issues={issues}
                    onChange={(key, value) =>
                      field.handleChange((current) => ({ ...current, [key]: value }))
                    }
                  />
                )}
              </form.Field>
            </SettingsGroup>
          )}
          <AddBar label="Add plugin" adding={add} disabled={!plugin} />
        </form.Form>
      </form.AppForm>
    </SettingsPage>
  )
}
