import type { Migration } from 'kysely/migration'
import * as m0001 from './0001_plugin_user_settings.ts'
import * as m0002 from './0002_auth.ts'
import * as m0003 from './0003_storage.ts'
import * as m0004 from './0004_providers.ts'
import * as m0005 from './0005_turns.ts'
import * as m0006 from './0006_user_tool_settings.ts'
import * as m0007 from './0007_admin.ts'
import * as m0008 from './0008_plugin_instances.ts'
import * as m0009 from './0009_registration.ts'
import * as m0010 from './0010_api_keys_and_cron.ts'

/** App migrations in order. Keys sort in the order they run. */
export const migrations: Record<string, Migration> = {
  '0001_plugin_user_settings': m0001,
  '0002_auth': m0002,
  '0003_storage': m0003,
  '0004_providers': m0004,
  '0005_turns': m0005,
  '0006_user_tool_settings': m0006,
  '0007_admin': m0007,
  '0008_plugin_instances': m0008,
  '0009_registration': m0009,
  '0010_api_keys_and_cron': m0010,
}
