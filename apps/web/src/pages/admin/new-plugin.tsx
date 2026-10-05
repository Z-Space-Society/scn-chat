import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../api.ts'
import { SchemaFields } from '../../components/SchemaFields.tsx'
import { issuesOf, messageOf } from '../../lib/errors.ts'
import { adminInstalledQuery, adminPluginsQuery } from '../../queries.ts'
import { usePluginsChanged } from './changes.ts'

type Draft = { package: string; options: Record<string, unknown> }

/** Pick an installed package, fill in its options, and add it. */
export function NewPluginAdmin() {
  const plugins = useQuery(adminPluginsQuery)
  const installed = useQuery(adminInstalledQuery)
  const navigate = useNavigate()
  const pluginsChanged = usePluginsChanged()
  const add = useMutation({
    mutationFn: (draft: Draft) => read(api.admin.plugins.$post({}, json(draft))),
    onSuccess: async ({ id }) => {
      await pluginsChanged()
      await navigate({ to: '/admin/plugins/$id', params: { id } })
    },
  })
  const form = useForm({
    defaultValues: { package: '', options: {} } as Draft,
    onSubmit: ({ value }) => add.mutate(value),
  })
  const picked = useFormStore(form.store, (state) => state.values.package)
  const added = new Set((plugins.data ?? []).map((instance) => instance.package))
  const available = (installed.data ?? []).filter((p) => p.multiple || !added.has(p.package))
  const plugin = available.find((p) => p.package === picked)
  const loadError = plugins.error ?? installed.error
  const error = add.error ? messageOf(add.error) : loadError && messageOf(loadError)
  return (
    <>
      <Link to="/admin/plugins">Back to plugins</Link>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <h2>Add plugin</h2>
        <form.Field
          name="package"
          listeners={{ onChange: () => form.setFieldValue('options', {}) }}
        >
          {(field) => (
            <select
              aria-label="Plugin package"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            >
              <option value="">Choose a plugin</option>
              {available.map((p) => (
                <option key={p.package} value={p.package}>
                  {p.package}
                </option>
              ))}
            </select>
          )}
        </form.Field>
        {plugin?.description && <p>{plugin.description}</p>}
        {plugin && (
          <form.Field name="options">
            {(field) => (
              <SchemaFields
                // Another package's fields start over, as its options do.
                key={plugin.package}
                schema={plugin.schema}
                values={field.state.value}
                secretFields={plugin.secretFields}
                issues={issuesOf(add.error)}
                onChange={(key, value) =>
                  field.handleChange((current) => ({ ...current, [key]: value }))
                }
              />
            )}
          </form.Field>
        )}
        <button type="submit">Add</button>
        {error && <p role="alert">{error}</p>}
      </form>
    </>
  )
}
