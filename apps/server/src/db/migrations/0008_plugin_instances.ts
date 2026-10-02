import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('plugin_instance')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('package', 'text', (col) => col.notNull())
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('enabled', 'integer', (col) => col.notNull())
    .addColumn('options_json', 'text', (col) => col.notNull())
    .addColumn('secrets_encrypted', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('updated_by', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('admin_model')
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('model_id', 'text', (col) => col.notNull())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('capabilities_json', 'text', (col) => col.notNull())
    .addColumn('roles_json', 'text', (col) => col.notNull())
    .addColumn('is_default', 'integer', (col) => col.notNull())
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('updated_by', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('admin_model_pk', ['provider', 'model_id'])
    .execute()
}
