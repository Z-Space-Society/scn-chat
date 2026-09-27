import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('turn_request')
    .addColumn('conversation_uri', 'text', (col) => col.notNull())
    .addColumn('message_rkey', 'text', (col) => col.notNull())
    .addColumn('attempt', 'integer', (col) => col.notNull())
    .addColumn('owner_did', 'text', (col) => col.notNull())
    .addColumn('requested_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('turn_request_pk', ['conversation_uri', 'message_rkey', 'attempt'])
    .execute()
  await db.schema
    .createTable('turn_claim')
    .addColumn('conversation_uri', 'text', (col) => col.notNull())
    .addColumn('reply_rkey', 'text', (col) => col.notNull())
    .addColumn('owner_did', 'text', (col) => col.notNull())
    .addColumn('claimed_at', 'text', (col) => col.notNull())
    .addPrimaryKeyConstraint('turn_claim_pk', ['conversation_uri', 'reply_rkey'])
    .execute()
}
