import { Hono } from 'hono'
import { z } from 'zod'
import { signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { AppEnv } from '../env.ts'
import { jsonObject } from '../schemas.ts'
import { type SettingKey, settingSchemas } from '../settings/schemas.ts'
import type { SettingsStore } from '../settings/store.ts'

/** Settings edited through generated forms. Access has its own routes. */
export const FORM_SETTINGS = ['general', 'sessions', 'turns', 'sync'] as const

type FormSetting = (typeof FORM_SETTINGS)[number]

const isFormSetting = (key: string): key is FormSetting =>
  (FORM_SETTINGS as readonly string[]).includes(key)

/** The app's own settings, as forms. */
export function settingsAdminRoutes(deps: { settings: SettingsStore }) {
  return new Hono<AppEnv>()
    .get('/settings', (c) =>
      c.json({
        settings: FORM_SETTINGS.map((key) => ({
          key,
          schema: z.toJSONSchema(settingSchemas[key], { io: 'input' }) as Record<string, unknown>,
          value: deps.settings.get(key as SettingKey) as Record<string, unknown>,
        })),
      }),
    )
    .put('/settings/:key', async (c) => {
      const key = c.req.param('key')
      if (!isFormSetting(key)) return c.json({ error: 'NotFound', message: 'No such setting' }, 404)
      const body = await jsonBody(c, jsonObject)
      const value = await deps.settings.set(key, body, signedInUser(c).did)
      return c.json({ value: value as Record<string, unknown> })
    })
}
