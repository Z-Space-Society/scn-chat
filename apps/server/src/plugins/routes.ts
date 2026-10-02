import type { Plugin } from '@scn-chat/plugin-api'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import { jsonObject } from '../schemas.ts'
import type { SecretBox } from '../secrets.ts'
import type { PluginHost } from './host.ts'
import {
  clearUserSettings,
  InvalidPluginSettingsError,
  readUserSettings,
  secretKeys,
  writeUserSettings,
} from './user-settings.ts'
import { isToolEnabled, readToolChoices, writeToolChoice } from './user-tools.ts'

export type PluginRoutesDeps = {
  db: Db
  box: SecretBox
  /** The current plugin runtime's host. */
  host: () => PluginHost
}

/** Per-user plugin settings and tool switches: forms, saving, and resetting. */
export function pluginRoutes(deps: PluginRoutesDeps) {
  const toolsOf = (plugin: Plugin) => {
    const { tools } = deps.host()
    return tools.list().filter((tool) => tools.owner(tool.name) === plugin.id)
  }
  const listed = () =>
    deps
      .host()
      .plugins.filter(
        (plugin) => plugin.userSettings || toolsOf(plugin).some((tool) => tool.userToggle),
      )
  const find = (id: string) =>
    deps.host().plugins.find((plugin) => plugin.id === id && plugin.userSettings)

  /** The plugin's settings form and the user's values, with secrets blanked. */
  const settingsOf = async (plugin: Plugin, did: string) => {
    if (!plugin.userSettings)
      return { schema: null, secretFields: [], values: {}, secretsSet: [], error: null }
    const schema = plugin.userSettings as z.ZodObject<z.ZodRawShape>
    const secrets = secretKeys(schema)
    const base = { schema: z.toJSONSchema(schema), secretFields: secrets }
    try {
      const values = (await readUserSettings(deps.db, deps.box, did, plugin)) as Record<
        string,
        unknown
      >
      const secretsSet = secrets.filter((key) => Boolean(values[key]))
      for (const key of secrets) values[key] = ''
      return { ...base, values, secretsSet, error: null }
    } catch (err) {
      if (!(err instanceof InvalidPluginSettingsError)) throw err
      return { ...base, values: {}, secretsSet: [], error: err.message }
    }
  }

  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/settings', async (c) => {
      const { did } = signedInUser(c)
      const choices = await readToolChoices(deps.db, did)
      const plugins = await Promise.all(
        listed().map(async (plugin) => ({
          id: plugin.id,
          name: plugin.name,
          tools: toolsOf(plugin).map((tool) => ({
            name: tool.name,
            description: tool.description,
            enabled: isToolEnabled(tool, choices),
            userToggle: tool.userToggle ?? false,
          })),
          ...(await settingsOf(plugin, did)),
        })),
      )
      return c.json({ plugins })
    })
    .put('/:id/tools/:name', async (c) => {
      const name = c.req.param('name')
      const { tools } = deps.host()
      const tool = tools.get(name)
      if (!tool || tools.owner(name) !== c.req.param('id'))
        return c.json({ error: 'NotFound' }, 404)
      if (!tool.userToggle)
        return c.json({ error: 'InvalidRequest', message: 'This tool cannot be switched' }, 400)
      const body = await jsonBody(c, z.object({ enabled: z.boolean() }))
      await writeToolChoice(deps.db, signedInUser(c).did, name, body.enabled)
      return c.json({ ok: true })
    })
    .put('/:id/settings', async (c) => {
      const plugin = find(c.req.param('id'))
      if (!plugin) return c.json({ error: 'NotFound' }, 404)
      const body = await jsonBody(c, jsonObject)
      try {
        await writeUserSettings(deps.db, deps.box, signedInUser(c).did, plugin, body)
      } catch (err) {
        if (err instanceof z.ZodError)
          return c.json({ error: 'InvalidSettings', message: err.message }, 400)
        throw err
      }
      return c.json({ ok: true })
    })
    .delete('/:id/settings', async (c) => {
      const plugin = find(c.req.param('id'))
      if (!plugin) return c.json({ error: 'NotFound' }, 404)
      await clearUserSettings(deps.db, signedInUser(c).did, plugin.id)
      return c.json({ ok: true })
    })
}
