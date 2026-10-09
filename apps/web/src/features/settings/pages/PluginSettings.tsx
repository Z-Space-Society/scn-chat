import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { type PluginValues, pluginValues, savePluginSettings } from '../lib/plugin-settings.ts'
import { type PluginSettingsEntry, pluginSettingsQuery } from '../queries.ts'

/** Each plugin's settings for the user, and the tools they may switch on and off. */
export function PluginSettings() {
  const query = useSuspenseQuery(pluginSettingsQuery)
  const plugins = query.data
  const queryClient = useQueryClient()
  const reload = () => queryClient.invalidateQueries({ queryKey: pluginSettingsQuery.queryKey })
  const save = useMutation({
    mutationFn: (edited: PluginValues) => savePluginSettings(plugins, edited),
    onSuccess: reload,
  })
  const reset = useMutation({
    mutationFn: (id: string) => read(api.plugins[':id'].settings.$delete({ param: { id } })),
    onSuccess: reload,
  })
  if (!plugins.length)
    return (
      <section>
        <h2>Plugins</h2>
        <p>No plugins have settings for you yet.</p>
      </section>
    )
  return (
    <section>
      <h2>Plugins</h2>
      <PluginsForm
        // Start over from the stored values whenever they change.
        key={query.dataUpdatedAt}
        plugins={plugins}
        saved={save.isSuccess}
        onSave={save.mutate}
        onReset={reset.mutate}
      />
      <ErrorAlert error={lastError(save, reset)} />
    </section>
  )
}

/** The plugin form, starting from the stored settings. */
function usePluginsForm(plugins: PluginSettingsEntry[], onSave: (values: PluginValues) => void) {
  // Fields are addressed by position, since tool names and setting keys may contain dots.
  return useAppForm({
    defaultValues: pluginValues(plugins),
    onSubmit: ({ value }) => onSave(value),
  })
}

type PluginsFormApi = ReturnType<typeof usePluginsForm>

interface PluginsFormProps {
  plugins: PluginSettingsEntry[]
  saved: boolean
  onSave: (values: PluginValues) => void
  onReset: (id: string) => void
}

function PluginsForm(props: PluginsFormProps) {
  const form = usePluginsForm(props.plugins, props.onSave)
  return (
    <form.AppForm>
      <form.Form>
        {props.plugins.map((plugin, i) => (
          <PluginFieldset
            key={plugin.id}
            form={form}
            plugin={plugin}
            index={i}
            onReset={() => props.onReset(plugin.id)}
          />
        ))}
        <form.SubmitButton>Save</form.SubmitButton>
        {props.saved && <span>Saved.</span>}
      </form.Form>
    </form.AppForm>
  )
}

interface PluginFieldsetProps {
  form: PluginsFormApi
  plugin: PluginSettingsEntry
  /** The plugin's position in the form. */
  index: number
  onReset: () => void
}

/** One plugin's tool switches, then its settings. */
function PluginFieldset(props: PluginFieldsetProps) {
  const i = props.index
  const switchable = props.plugin.tools.flatMap((tool, j) => (tool.userToggle ? [{ tool, j }] : []))
  return (
    <fieldset>
      <legend>{props.plugin.name}</legend>
      {switchable.map(({ tool, j }) => (
        <props.form.Field key={tool.name} name={`plugins[${i}].tools[${j}]`}>
          {(field) => (
            <label title={tool.description}>
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
              {switchable.length === 1 ? 'Enabled' : tool.name}
            </label>
          )}
        </props.form.Field>
      ))}
      <PluginSchema form={props.form} plugin={props.plugin} index={i} onReset={props.onReset} />
    </fieldset>
  )
}

/** A plugin's settings, or the error reading them with a way to reset them. */
function PluginSchema(props: PluginFieldsetProps) {
  if (props.plugin.error)
    return (
      <p role="alert">
        {props.plugin.error}{' '}
        <button type="button" onClick={props.onReset}>
          Reset
        </button>
      </p>
    )
  const schema = props.plugin.schema
  if (!schema) return null
  return (
    <props.form.Field name={`plugins[${props.index}].values`}>
      {(field) => (
        <SchemaFields
          schema={schema as Schema}
          values={field.state.value}
          secrets={{ fields: props.plugin.secretFields, stored: props.plugin.secretsSet }}
          onChange={(key, value) => field.handleChange((current) => ({ ...current, [key]: value }))}
        />
      )}
    </props.form.Field>
  )
}
