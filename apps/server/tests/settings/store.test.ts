import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { InvalidBody } from '../../src/body.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { SettingsStore, StoredSettingError } from '../../src/settings/store.ts'
import { dialects } from '../helpers/db.ts'

const logger = pino({ level: 'silent' })

describe.each(dialects)('SettingsStore on $name', ({ create }) => {
  async function setup() {
    const db = create()
    await migrateToLatest(db)
    return { db, store: await SettingsStore.load(db, logger) }
  }

  it('makes a valid write visible at once, stores it, and tells subscribers', async () => {
    const { db, store } = await setup()
    const listener = vi.fn()
    store.subscribe('general', listener)
    await store.set('general', { appName: 'Renamed' }, 'did:plc:admin')
    expect(store.get('general')).toEqual({ appName: 'Renamed' })
    expect(listener).toHaveBeenCalledWith({ appName: 'Renamed' })
    expect((await SettingsStore.load(db, logger)).get('general').appName).toBe('Renamed')
  })

  it('refuses a write that fails the schema, with the field at fault', async () => {
    const { store } = await setup()
    const error = await store
      .set('turns', { maxSteps: 0 }, 'did:plc:admin')
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(InvalidBody)
    expect((error as InvalidBody).issues[0]?.path).toEqual(['maxSteps'])
    expect(store.get('turns').maxSteps).toBe(8)
  })

  it('stops loading when a stored value fails its schema, naming the key', async () => {
    const { db } = await setup()
    await db
      .insertInto('app_setting')
      .values({
        key: 'sessions',
        value_json: '{"ttlDays":0}',
        updated_at: new Date().toISOString(),
        updated_by: 'did:plc:admin',
      })
      .execute()
    const loading = SettingsStore.load(db, logger)
    await expect(loading).rejects.toBeInstanceOf(StoredSettingError)
    await expect(loading).rejects.toThrow(/"sessions"/)
  })
})
