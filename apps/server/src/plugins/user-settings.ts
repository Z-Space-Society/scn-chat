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

/**
 * The stored settings. Secrets no current or retired key can decrypt read as unset, with the
 * ciphertext kept in `unreadable` so a restored key in `SECRET_KEYS_OLD` brings them back.
 */
async function readRaw(
  db: Db,
  box: SecretBox,
  did: string,
  pluginId: string,
): Promise<{
  values: Record<string, unknown>
  secrets: Record<string, unknown>
  unreadable: string | null
}> {
  const row = await db
    .selectFrom('plugin_user_settings')
    .select(['values_json', 'secrets_encrypted'])
    .where('did', '=', did)
    .where('plugin_id', '=', pluginId)
    .executeTakeFirst()
  const values = row ? (JSON.parse(row.values_json) as Record<string, unknown>) : {}
  if (!row?.secrets_encrypted) return { values, secrets: {}, unreadable: null }
  const decrypted = box.tryDecrypt(row.secrets_encrypted)
  if (decrypted === undefined) return { values, secrets: {}, unreadable: row.secrets_encrypted }
  return { values, secrets: JSON.parse(decrypted) as Record<string, unknown>, unreadable: null }
}

/** A user's validated settings for a plugin, and whether its stored secrets can't be decrypted. */
export async function readUserSettingsState(
  db: Db,
  box: SecretBox,
  did: string,
  plugin: Plugin,
): Promise<{ settings: unknown; secretsUnreadable: boolean }> {
  if (!plugin.userSettings) return { settings: {}, secretsUnreadable: false }
  const { values, secrets, unreadable } = await readRaw(db, box, did, plugin.id)
  const result = plugin.userSettings.safeParse({ ...values, ...secrets })
  if (!result.success) throw new InvalidPluginSettingsError(plugin.id, result.error.message)
  return { settings: result.data, secretsUnreadable: unreadable !== null }
}

/** A user's validated settings for a plugin, with defaults when none are stored. */
export async function readUserSettings(
  db: Db,
  box: SecretBox,
  did: string,
  plugin: Plugin,
): Promise<unknown> {
  return (await readUserSettingsState(db, box, did, plugin)).settings
}

/**
 * Validate and store a user's settings. A missing or empty secret keeps the stored one, and
 * undecryptable secrets are kept until the user enters one.
 */
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
  const entered = Object.values(secrets).some((value) => value !== undefined && value !== '')
  const encrypted = secretFields.length > 0 ? box.encrypt(JSON.stringify(secrets)) : null
  const row = {
    values_json: JSON.stringify(values),
    secrets_encrypted: stored.unreadable && !entered ? stored.unreadable : encrypted,
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
