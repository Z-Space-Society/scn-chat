import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plugin_user_settings')
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('plugin_id', 'text', (col) => col.notNull())
    .addColumn('values_json', 'text', (col) => col.notNull())
    .addColumn('secrets_encrypted', 'text')
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('plugin_user_settings_pk', ['did', 'plugin_id'])
    .execute()
}
