import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('app_setting')
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('value_json', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('updated_by', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('role')
    .addColumn('name', 'text', (col) => col.primaryKey())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('pds_hosts_json', 'text', (col) => col.notNull())
    .addColumn('handle_domains_json', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('role_member')
    .addColumn('role', 'text', (col) => col.notNull())
    .addColumn('did', 'text', (col) => col.notNull())
    .addColumn('added_at', 'text', (col) => col.notNull())
    .addColumn('added_by', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('role_member_pk', ['role', 'did'])
    .execute()
  await db.schema.createIndex('role_member_did').on('role_member').column('did').execute()
  const now = new Date().toISOString()
  await (db as Kysely<{ role: Record<string, string> }>)
    .insertInto('role')
    .values({
      name: 'admin',
      description: 'Can use the admin area.',
      pds_hosts_json: '[]',
      handle_domains_json: '[]',
      created_at: now,
      updated_at: now,
    })
    .execute()
  await db.schema
    .alterTable('account')
    .addColumn('viewer_only', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
}
