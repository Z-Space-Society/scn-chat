import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { issuesOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
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
  return (
    <>
      <Link to="/admin/plugins">Back to plugins</Link>
      <form.AppForm>
        <form.Form>
          <h2>Add plugin</h2>
          <form.AppField
            name="package"
            listeners={{ onChange: () => form.setFieldValue('options', {}) }}
          >
            {(field) => (
              <field.SelectField aria-label="Plugin package" required>
                <option value="">Choose a plugin</option>
                {available.map((p) => (
                  <option key={p.package} value={p.package}>
                    {p.package}
                  </option>
                ))}
              </field.SelectField>
            )}
          </form.AppField>
          {plugin?.description && <p>{plugin.description}</p>}
          {plugin && (
            <form.Field name="options">
              {(field) => (
                <SchemaFields
                  // Another package's fields start over, as its options do. A list field keeps
                  // its own text, which would otherwise carry over to a field of the same name.
                  key={plugin.package}
                  schema={plugin.schema}
                  values={field.state.value}
                  secrets={{ fields: plugin.secretFields }}
                  issues={issuesOf(add.error)}
                  onChange={(key, value) =>
                    field.handleChange((current) => ({ ...current, [key]: value }))
                  }
                />
              )}
            </form.Field>
          )}
          <form.SubmitButton>Add</form.SubmitButton>
          <ErrorAlert error={add.error} />
        </form.Form>
      </form.AppForm>
    </>
  )
}
