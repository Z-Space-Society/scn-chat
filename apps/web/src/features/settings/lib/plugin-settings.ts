import { api, json, read } from '../../../shared/api.ts'
import type { PluginSettingsEntry } from '../queries.ts'

/** The plugin form's values: each plugin's settings and tool switches, by position. */
export interface PluginValues {
  plugins: { values: Record<string, unknown>; tools: boolean[] }[]
}

/** The form's starting values, from the stored settings. */
export const pluginValues = (plugins: PluginSettingsEntry[]): PluginValues => ({
  plugins: plugins.map((plugin) => ({
    values: plugin.values as Record<string, unknown>,
    tools: plugin.tools.map((tool) => tool.enabled),
  })),
})

/**
 * Save every plugin's settings, and the tool switches the user changed. Each write is its own row
 * on the server, so they all go at once.
 */
export async function savePluginSettings(plugins: PluginSettingsEntry[], edited: PluginValues) {
  const writes: Promise<unknown>[] = []
  for (const [i, plugin] of plugins.entries()) {
    const draft = edited.plugins[i]
    if (plugin.schema && !plugin.error)
      writes.push(
        read(
          api.plugins[':id'].settings.$put(
            { param: { id: plugin.id } },
            json(draft?.values ?? plugin.values),
          ),
        ),
      )
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
}
