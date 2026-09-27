import type { Migration } from 'kysely/migration'
import * as m0001 from './0001_plugin_user_settings.ts'
import * as m0002 from './0002_auth.ts'
import * as m0003 from './0003_storage.ts'
import * as m0004 from './0004_providers.ts'
import * as m0005 from './0005_turns.ts'

/** App migrations in order. Keys sort in the order they run. */
export const migrations: Record<string, Migration> = {
  '0001_plugin_user_settings': m0001,
  '0002_auth': m0002,
  '0003_storage': m0003,
  '0004_providers': m0004,
  '0005_turns': m0005,
}
