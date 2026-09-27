import { definePlugin } from '@scn-chat/plugin-api'
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { migrateToLatest } from '../../src/db/migrate.ts'
import {
  clearUserSettings,
  InvalidPluginSettingsError,
  readUserSettings,
  secretKeys,
  writeUserSettings,
} from '../../src/plugins/user-settings.ts'
import { SecretBox } from '../../src/secrets.ts'
import { dialects } from '../helpers/db.ts'

const box = new SecretBox(Buffer.alloc(32, 7))
const did = 'did:plc:alice'
const schema = z.object({
  engine: z.string().default('duckduckgo'),
  apiKey: z.string().default('').meta({ secret: true }),
})
const plugin = definePlugin({
  id: 'search',
  name: 'Search',
  apiVersion: 1,
  userSettings: schema,
  setup: () => {},
})

describe('secretKeys', () => {
  it('finds fields marked secret', () => {
    expect(secretKeys(schema)).toEqual(['apiKey'])
  })
})

describe.each(dialects)('plugin user settings on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('returns schema defaults when nothing is stored', async () => {
    const db = await setup()
    expect(await readUserSettings(db, box, did, plugin)).toEqual({
      engine: 'duckduckgo',
      apiKey: '',
    })
    await db.destroy()
  })

  it('round-trips settings, storing secret fields encrypted', async () => {
    const db = await setup()
    await writeUserSettings(db, box, did, plugin, { engine: 'kagi', apiKey: 'sk-secret' })
    expect(await readUserSettings(db, box, did, plugin)).toEqual({
      engine: 'kagi',
      apiKey: 'sk-secret',
    })
    const { rows } = await sql<{
      values_json: string
      secrets_encrypted: string
    }>`select * from plugin_user_settings`.execute(db)
    expect(rows[0]?.values_json).not.toContain('sk-secret')
    expect(rows[0]?.secrets_encrypted).not.toContain('sk-secret')
    await db.destroy()
  })

  it('keeps the stored secret when a write leaves it empty', async () => {
    const db = await setup()
    await writeUserSettings(db, box, did, plugin, { engine: 'kagi', apiKey: 'sk-secret' })
    await writeUserSettings(db, box, did, plugin, { engine: 'brave', apiKey: '' })
    expect(await readUserSettings(db, box, did, plugin)).toEqual({
      engine: 'brave',
      apiKey: 'sk-secret',
    })
    await db.destroy()
  })

  it('raises instead of resetting when stored values fail validation', async () => {
    const db = await setup()
    await sql`insert into plugin_user_settings (did, plugin_id, values_json, secrets_encrypted, updated_at)
      values (${did}, 'search', ${JSON.stringify({ engine: 42 })}, null, 'now')`.execute(db)
    await expect(readUserSettings(db, box, did, plugin)).rejects.toBeInstanceOf(
      InvalidPluginSettingsError,
    )
    await db.destroy()
  })

  it('clears stored values so the defaults apply', async () => {
    const db = await setup()
    await writeUserSettings(db, box, did, plugin, { engine: 'kagi', apiKey: 'sk-secret' })
    await clearUserSettings(db, did, 'search')
    expect(await readUserSettings(db, box, did, plugin)).toEqual({
      engine: 'duckduckgo',
      apiKey: '',
    })
    await db.destroy()
  })

  it('keeps each user separate', async () => {
    const db = await setup()
    await writeUserSettings(db, box, did, plugin, { engine: 'kagi' })
    expect(await readUserSettings(db, box, 'did:plc:bob', plugin)).toEqual({
      engine: 'duckduckgo',
      apiKey: '',
    })
    await db.destroy()
  })
})
