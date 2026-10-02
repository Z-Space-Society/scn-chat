import { describeIssues, issuesOf, validate } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import { type SettingKey, type Settings, settingSchemas } from './schemas.ts'

export class StoredSettingError extends Error {
  constructor(key: string, details: string) {
    super(`The stored "${key}" setting is invalid: ${details}`)
    this.name = 'StoredSettingError'
  }
}

type Listener<K extends SettingKey> = (value: Settings[K]) => void

/** Admin settings, held in memory and written through to the database. */
export class SettingsStore {
  private readonly values: Partial<Settings>
  private readonly listeners = new Map<SettingKey, Set<Listener<never>>>()
  private readonly db: Db
  private readonly logger: Logger

  constructor(db: Db, logger: Logger, values: Partial<Settings> = {}) {
    this.db = db
    this.logger = logger
    this.values = values
  }

  /** Read and validate every stored setting. A stored value that fails its schema stops startup. */
  static async load(db: Db, logger: Logger): Promise<SettingsStore> {
    const rows = await db.selectFrom('app_setting').select(['key', 'value_json']).execute()
    const values: Record<string, unknown> = {}
    for (const row of rows) {
      const schema = settingSchemas[row.key as SettingKey]
      if (!schema) {
        logger.warn({ key: row.key }, 'ignoring a stored setting no schema describes')
        continue
      }
      const result = schema.safeParse(JSON.parse(row.value_json))
      if (!result.success)
        throw new StoredSettingError(row.key, describeIssues(issuesOf(result.error)))
      values[row.key] = result.data
    }
    return new SettingsStore(db, logger, values as Partial<Settings>)
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return (this.values[key] ?? settingSchemas[key].parse({})) as Settings[K]
  }

  /** Validate, store, and announce a setting. Throws InvalidBody when it fails its schema. */
  async set<K extends SettingKey>(key: K, input: unknown, adminDid: string): Promise<Settings[K]> {
    const value = validate(settingSchemas[key], input) as Settings[K]
    const row = {
      value_json: JSON.stringify(value),
      updated_at: new Date().toISOString(),
      updated_by: adminDid,
    }
    await this.db
      .insertInto('app_setting')
      .values({ key, ...row })
      .onConflict((oc) => oc.column('key').doUpdateSet(row))
      .execute()
    this.values[key] = value
    this.logger.info({ key, admin: adminDid }, 'admin setting changed')
    for (const listener of this.listeners.get(key) ?? []) (listener as Listener<K>)(value)
    return value
  }

  /** Call the listener after each change to the setting. */
  subscribe<K extends SettingKey>(key: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener as Listener<never>)
    return () => set.delete(listener as Listener<never>)
  }
}
