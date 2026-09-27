import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { SecretBox } from '../secrets.ts'
import type { PluginHost } from './host.ts'
import {
  clearUserSettings,
  InvalidPluginSettingsError,
  readUserSettings,
  secretKeys,
  writeUserSettings,
} from './user-settings.ts'

export type PluginRoutesDeps = { db: Db; box: SecretBox; host: PluginHost }

/** Per-user plugin settings: forms, saving, and resetting. */
export function pluginRoutes(deps: PluginRoutesDeps) {
  const configurable = () => deps.host.plugins.filter((plugin) => plugin.userSettings)
  const find = (id: string) => configurable().find((plugin) => plugin.id === id)

  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/settings', async (c) => {
      const { did } = signedInUser(c)
      const plugins = await Promise.all(
        configurable().map(async (plugin) => {
          const schema = plugin.userSettings as z.ZodObject<z.ZodRawShape>
          const secrets = secretKeys(schema)
          const base = {
            id: plugin.id,
            name: plugin.name,
            schema: z.toJSONSchema(schema),
            secretFields: secrets,
          }
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
        }),
      )
      return c.json({ plugins })
    })
    .put('/:id/settings', async (c) => {
      const plugin = find(c.req.param('id'))
      if (!plugin) return c.json({ error: 'NotFound' }, 404)
      const body = (await c.req.json()) as Record<string, unknown>
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
