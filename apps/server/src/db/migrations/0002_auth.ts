import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('account')
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('handle', 'text')
    .addColumn('pds_url', 'text', (col) => col.notNull())
    .addColumn('storage_mode', 'text', (col) => col.notNull())
    .addColumn('background_sync', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('last_login_at', 'text', (col) => col.notNull())
    .addColumn('last_active_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('web_session')
    .addColumn('token_hash', 'text', (col) => col.primaryKey())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('expires_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema.createIndex('web_session_did').on('web_session').column('did').execute()
  for (const table of ['oauth_state', 'oauth_session']) {
    await db.schema
      .createTable(table)
      .addColumn('key', 'text', (col) => col.primaryKey())
      .addColumn('value', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'text', (col) => col.notNull())
      .execute()
  }
}
