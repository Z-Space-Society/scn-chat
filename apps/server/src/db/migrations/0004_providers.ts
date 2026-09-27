import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('provider_credential')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('owner_did', 'text', (col) => col.notNull())
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('name', 'text')
    .addColumn('slug', 'text')
    .addColumn('base_url', 'text')
    .addColumn('api_key_encrypted', 'text', (col) => col.notNull())
    .addColumn('key_hint', 'text', (col) => col.notNull())
    .addColumn('models_json', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('provider_credential_owner')
    .on('provider_credential')
    .column('owner_did')
    .execute()
}
