import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_tool_settings')
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('tool', 'text', (col) => col.notNull())
    .addColumn('enabled', 'integer', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('user_tool_settings_pk', ['did', 'tool'])
    .execute()
}
