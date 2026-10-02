import type { Plugin } from '@scn-chat/plugin-api'
import type { Db } from '../db/index.ts'
import type { SecretBox } from '../secrets.ts'
import { secretKeys } from './installed.ts'

export class InvalidPluginSettingsError extends Error {
  readonly pluginId: string

  constructor(pluginId: string, details: string) {
    super(`Stored settings for plugin "${pluginId}" are invalid: ${details}`)
    this.name = 'InvalidPluginSettingsError'
    this.pluginId = pluginId
  }
}

export { secretKeys }

async function readRaw(db: Db, box: SecretBox, did: string, pluginId: string) {
  const row = await db
    .selectFrom('plugin_user_settings')
    .select(['values_json', 'secrets_encrypted'])
    .where('did', '=', did)
    .where('plugin_id', '=', pluginId)
    .executeTakeFirst()
  if (!row) return { values: {}, secrets: {} }
  return {
    values: JSON.parse(row.values_json) as Record<string, unknown>,
    secrets: row.secrets_encrypted
      ? (JSON.parse(box.decrypt(row.secrets_encrypted)) as Record<string, unknown>)
      : {},
  }
}

/** A user's validated settings for a plugin, with defaults when none are stored. */
export async function readUserSettings(
  db: Db,
  box: SecretBox,
  did: string,
  plugin: Plugin,
): Promise<unknown> {
  if (!plugin.userSettings) return {}
  const { values, secrets } = await readRaw(db, box, did, plugin.id)
  const result = plugin.userSettings.safeParse({ ...values, ...secrets })
  if (!result.success) throw new InvalidPluginSettingsError(plugin.id, result.error.message)
  return result.data
}

/** Validate and store a user's settings. A missing or empty secret keeps the stored one. */
export async function writeUserSettings(
  db: Db,
  box: SecretBox,
  did: string,
  plugin: Plugin,
  input: Record<string, unknown>,
) {
  if (!plugin.userSettings)
    throw new InvalidPluginSettingsError(plugin.id, 'plugin has no user settings')
  const secretFields = secretKeys(plugin.userSettings)
  const stored = await readRaw(db, box, did, plugin.id)
  const merged = { ...input }
  for (const key of secretFields) {
    if (merged[key] === undefined || merged[key] === '') merged[key] = stored.secrets[key]
  }
  const parsed = plugin.userSettings.parse(merged) as Record<string, unknown>
  const values = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !secretFields.includes(key)),
  )
  const secrets = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => secretFields.includes(key)),
  )
  const row = {
    values_json: JSON.stringify(values),
    secrets_encrypted: secretFields.length > 0 ? box.encrypt(JSON.stringify(secrets)) : null,
    updated_at: new Date().toISOString(),
  }
  await db
    .insertInto('plugin_user_settings')
    .values({ did, plugin_id: plugin.id, ...row })
    .onConflict((oc) => oc.columns(['did', 'plugin_id']).doUpdateSet(row))
    .execute()
}

export async function clearUserSettings(db: Db, did: string, pluginId: string): Promise<void> {
  await db
    .deleteFrom('plugin_user_settings')
    .where('did', '=', did)
    .where('plugin_id', '=', pluginId)
    .execute()
}
