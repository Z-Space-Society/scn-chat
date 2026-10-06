import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('api_key')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('label', 'text', (col) => col.notNull())
    .addColumn('key_hash', 'text', (col) => col.notNull().unique())
    .addColumn('roles_json', 'text', (col) => col.notNull())
    .addColumn('created_by', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('last_used_at', 'text')
    .execute()
  await db.schema
    .createTable('cron_run')
    .addColumn('id', 'integer', (col) => col.primaryKey().check(sql`id = 1`))
    .addColumn('started_at', 'text', (col) => col.notNull())
    .addColumn('finished_at', 'text')
    .addColumn('failed_json', 'text', (col) => col.notNull())
    .execute()
}
