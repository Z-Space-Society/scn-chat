import pino from 'pino'
import { Access } from '../../src/auth/access.ts'
import { Roles } from '../../src/auth/roles.ts'
import type { Db } from '../../src/db/index.ts'
import type { Settings } from '../../src/settings/schemas.ts'
import { SettingsStore } from '../../src/settings/store.ts'
import { TEST_ADMIN } from './config.ts'

const logger = pino({ level: 'silent' })

/** Settings for tests, with the defaults unless the values say otherwise. */
export const testSettings = (db: Db, values: Partial<Settings> = {}) =>
  new SettingsStore(db, logger, values)

export const testRoles = (db: Db, options: Partial<ConstructorParameters<typeof Roles>[0]> = {}) =>
  new Roles({ db, adminDids: new Set([TEST_ADMIN]), sources: () => [], logger, ...options })

/** Roles, settings, and access over one database. */
export function testAccess(db: Db, values: Partial<Settings> = {}) {
  const settings = testSettings(db, values)
  const roles = testRoles(db)
  return { settings, roles, access: new Access({ db, roles, settings, logger }) }
}
