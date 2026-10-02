import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('account').addColumn('suspended_at', 'text').execute()
  await db.schema.alterTable('account').addColumn('suspended_by', 'text').execute()
  await db.schema.alterTable('account').addColumn('suspended_reason', 'text').execute()
  await db.schema
    .createTable('account_invite')
    .addColumn('did', 'text', (col) => col.primaryKey())
    .addColumn('added_by', 'text', (col) => col.notNull())
    .addColumn('added_at', 'text', (col) => col.notNull())
    .execute()
}
