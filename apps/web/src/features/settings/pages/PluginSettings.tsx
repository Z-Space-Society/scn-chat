import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { Button } from '../../../shared/ui/Button.tsx'
import { Switch } from '../../../shared/ui/controls.tsx'
import {
  SaveBar,
  SettingRow,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
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
  const error = lastError(save, reset)
  return (
    <SettingsPage
      title="Plugins"
      description="Turn on the tools you want models to use, and set up the plugins that offer them."
    >
      {plugins.length ? (
        <PluginsForm
          // Start over from the stored values whenever they change.
          key={query.dataUpdatedAt}
          plugins={plugins}
          pending={save.isPending}
          saved={save.isSuccess}
          error={error && messageOf(error)}
          onSave={save.mutate}
          onEdit={save.reset}
          onReset={reset.mutate}
        />
      ) : (
        <SettingsEmpty outlined>No plugins have settings for you yet.</SettingsEmpty>
      )}
    </SettingsPage>
  )
}

/** The plugin form, starting from the stored settings. */
function usePluginsForm(props: PluginsFormProps) {
  // Fields are addressed by position, since tool names and setting keys may contain dots.
  return useAppForm({
    defaultValues: pluginValues(props.plugins),
    // An edit after a save means the page no longer holds what was saved.
    listeners: { onChange: () => props.onEdit() },
    onSubmit: ({ value }) => props.onSave(value),
  })
}

type PluginsFormApi = ReturnType<typeof usePluginsForm>

interface PluginsFormProps {
  plugins: PluginSettingsEntry[]
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (values: PluginValues) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
  onReset: (id: string) => void
}

function PluginsForm(props: PluginsFormProps) {
  const form = usePluginsForm(props)
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
        <SaveBar pending={props.pending} saved={props.saved} error={props.error} />
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

/** One plugin's card: its tool switches, then its settings. */
function PluginFieldset(props: PluginFieldsetProps) {
  const i = props.index
  const switchable = props.plugin.tools.flatMap((tool, j) => (tool.userToggle ? [{ tool, j }] : []))
  return (
    <SettingsGroup title={props.plugin.name}>
      {switchable.map(({ tool, j }) => (
        <props.form.Field key={tool.name} name={`plugins[${i}].tools[${j}]`}>
          {(field) => (
            <SettingRow
              label={switchable.length === 1 ? 'Enabled' : tool.name}
              htmlFor={`plugin-${i}-tool-${j}`}
              description={tool.description}
            >
              <Switch
                id={`plugin-${i}-tool-${j}`}
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
            </SettingRow>
          )}
        </props.form.Field>
      ))}
      <PluginSchema form={props.form} plugin={props.plugin} index={i} onReset={props.onReset} />
    </SettingsGroup>
  )
}

/** A plugin's settings, or the error reading them with a way to reset them. */
function PluginSchema(props: PluginFieldsetProps) {
  if (props.plugin.error)
    return (
      <div className="flex items-center gap-3 bg-danger-soft p-card-pad">
        <p role="alert" className="flex-1 text-small">
          {props.plugin.error}
        </p>
        <Button size="small" onClick={props.onReset}>
          Reset
        </Button>
      </div>
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
