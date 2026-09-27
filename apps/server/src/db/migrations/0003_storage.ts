import type { Kysely } from 'kysely'
import { autoIncrementKey } from '../dialect.ts'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('local_space')
    .addColumn('uri', 'text', (col) => col.primaryKey())
    .addColumn('owner_did', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('skey', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createTable('local_record')
    .addColumn('space_uri', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('value_json', 'text', (col) => col.notNull())
    .addColumn('cid', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('local_record_pk', ['space_uri', 'collection', 'rkey'])
    .execute()
  const seq = autoIncrementKey(db)
  await db.schema
    .createTable('local_op')
    .addColumn('seq', seq.type, seq.build)
    .addColumn('space_uri', 'text', (col) => col.notNull())
    .addColumn('collection', 'text', (col) => col.notNull())
    .addColumn('rkey', 'text', (col) => col.notNull())
    .addColumn('cid', 'text')
    .addColumn('value_json', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()
  await db.schema
    .createIndex('local_op_space')
    .on('local_op')
    .columns(['space_uri', 'seq'])
    .execute()
  await db.schema
    .createTable('sync_state')
    .addColumn('space_uri', 'text', (col) => col.primaryKey())
    .addColumn('owner_did', 'text', (col) => col.notNull())
    .addColumn('last_rev', 'text')
    .addColumn('registered_until', 'text')
    .addColumn('last_synced_at', 'text')
    .addColumn('last_error', 'text')
    .execute()
  await db.schema.createIndex('sync_state_owner').on('sync_state').column('owner_did').execute()
}
