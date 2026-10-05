import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../api.ts'
import { SchemaFields } from '../../components/SchemaFields.tsx'
import { lastError, messageOf } from '../../lib/errors.ts'
import { pluginSettingsQuery } from '../../queries.ts'

type PluginEntry = {
  id: string
  name: string
  tools: { name: string; description: string; enabled: boolean; userToggle: boolean }[]
  schema: object | null
  values: Record<string, unknown>
  secretFields: string[]
  secretsSet: string[]
  error: string | null
}

/** The plugin form's values: each plugin's settings and tool switches, by position. */
type PluginValues = { plugins: { values: Record<string, unknown>; tools: boolean[] }[] }

export function PluginSettings() {
  const query = useQuery(pluginSettingsQuery)
  const queryClient = useQueryClient()
  const reload = () => queryClient.invalidateQueries({ queryKey: pluginSettingsQuery.queryKey })
  const plugins = query.data as PluginEntry[] | undefined
  const save = useMutation({
    // Each write is its own row on the server, so they all go at once.
    mutationFn: async ({ plugins: edited }: PluginValues) => {
      const writes: Promise<unknown>[] = []
      for (const [i, plugin] of (plugins ?? []).entries()) {
        const draft = edited[i]
        if (plugin.schema && !plugin.error) {
          writes.push(
            read(
              api.plugins[':id'].settings.$put(
                { param: { id: plugin.id } },
                json(draft?.values ?? plugin.values),
              ),
            ),
          )
        }
        for (const [j, tool] of plugin.tools.entries()) {
          const enabled = draft?.tools[j] ?? tool.enabled
          if (!tool.userToggle || enabled === tool.enabled) continue
          writes.push(
            read(
              api.plugins[':id'].tools[':name'].$put(
                { param: { id: plugin.id, name: tool.name } },
                json({ enabled }),
              ),
            ),
          )
        }
      }
      await Promise.all(writes)
    },
    onSuccess: reload,
  })
  const reset = useMutation({
    mutationFn: (id: string) => read(api.plugins[':id'].settings.$delete({ param: { id } })),
    onSuccess: reload,
  })
  const error = lastError(save, reset) ?? (query.error && messageOf(query.error))
  if (!plugins) return error ? <p role="alert">{error}</p> : null
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
      <PluginForm
        // Start over from the stored values whenever they load or change.
        key={query.dataUpdatedAt}
        plugins={plugins}
        saved={save.isSuccess}
        onSave={save.mutate}
        onReset={reset.mutate}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

function PluginForm({
  plugins,
  saved,
  onSave,
  onReset,
}: {
  plugins: PluginEntry[]
  saved: boolean
  onSave: (values: PluginValues) => void
  onReset: (id: string) => void
}) {
  // Fields are addressed by position, since tool names and setting keys may contain dots.
  const form = useForm({
    defaultValues: {
      plugins: plugins.map((plugin) => ({
        values: plugin.values,
        tools: plugin.tools.map((tool) => tool.enabled),
      })),
    } as PluginValues,
    onSubmit: ({ value }) => onSave(value),
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {plugins.map((plugin, i) => {
        const switchable = plugin.tools.flatMap((tool, j) => (tool.userToggle ? [{ tool, j }] : []))
        return (
          <fieldset key={plugin.id}>
            <legend>{plugin.name}</legend>
            {switchable.map(({ tool, j }) => (
              <form.Field key={tool.name} name={`plugins[${i}].tools[${j}]`}>
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
              </form.Field>
            ))}
            {plugin.error ? (
              <p role="alert">
                {plugin.error}{' '}
                <button type="button" onClick={() => onReset(plugin.id)}>
                  Reset
                </button>
              </p>
            ) : (
              plugin.schema && (
                <form.Field name={`plugins[${i}].values`}>
                  {(field) => (
                    <SchemaFields
                      schema={plugin.schema as object}
                      values={field.state.value}
                      secretFields={plugin.secretFields}
                      secretsSet={plugin.secretsSet}
                      onChange={(key, value) =>
                        field.handleChange((current) => ({ ...current, [key]: value }))
                      }
                    />
                  )}
                </form.Field>
              )
            )}
          </fieldset>
        )
      })}
      <button type="submit">Save</button>
      {saved && <span>Saved.</span>}
    </form>
  )
}
