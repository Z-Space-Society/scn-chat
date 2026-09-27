import type { Db } from '../db/index.ts'
import {
  InvalidCursor,
  type OpsPage,
  RecordExists,
  type RecordKey,
  type RecordStore,
  SpaceExists,
  SpaceNotFound,
  type StoredRecord,
} from './record-store.ts'
import { type JsonRecord, recordCid, spaceUri } from './records.ts'
import { assertValidRecord } from './validate.ts'

const rev = (seq: number) => String(seq).padStart(16, '0')

/** A stand-in for a PDS in the app database, for users whose PDS lacks spaces. */
export class LocalRecordStore implements RecordStore {
  readonly did: string
  private readonly db: Db

  constructor(did: string, db: Db) {
    this.did = did
    this.db = db
  }

  private async assertSpace(space: string): Promise<void> {
    const row = await this.db
      .selectFrom('local_space')
      .select('uri')
      .where('uri', '=', space)
      .executeTakeFirst()
    if (!row) throw new SpaceNotFound(space)
  }

  async createSpace(type: string, skey: string): Promise<string> {
    const uri = spaceUri(this.did, type, skey)
    const existing = await this.db
      .selectFrom('local_space')
      .select('uri')
      .where('uri', '=', uri)
      .executeTakeFirst()
    if (existing) throw new SpaceExists(uri)
    await this.db
      .insertInto('local_space')
      .values({ uri, owner_did: this.did, type, skey, created_at: new Date().toISOString() })
      .execute()
    return uri
  }

  async deleteSpace(space: string): Promise<void> {
    await this.assertSpace(space)
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('local_op').where('space_uri', '=', space).execute()
      await tx.deleteFrom('local_record').where('space_uri', '=', space).execute()
      await tx.deleteFrom('local_space').where('uri', '=', space).execute()
    })
  }

  async getRecord(space: string, collection: string, rkey: string): Promise<StoredRecord | null> {
    await this.assertSpace(space)
    const row = await this.db
      .selectFrom('local_record')
      .select(['value_json', 'cid'])
      .where('space_uri', '=', space)
      .where('collection', '=', collection)
      .where('rkey', '=', rkey)
      .executeTakeFirst()
    return row ? { rkey, value: JSON.parse(row.value_json) as JsonRecord, cid: row.cid } : null
  }

  async listRecords(space: string, collection: string): Promise<StoredRecord[]> {
    await this.assertSpace(space)
    const rows = await this.db
      .selectFrom('local_record')
      .select(['rkey', 'value_json', 'cid'])
      .where('space_uri', '=', space)
      .where('collection', '=', collection)
      .orderBy('rkey')
      .execute()
    return rows.map((row) => ({
      rkey: row.rkey,
      value: JSON.parse(row.value_json) as JsonRecord,
      cid: row.cid,
    }))
  }

  async listKeys(space: string): Promise<RecordKey[]> {
    await this.assertSpace(space)
    return this.db
      .selectFrom('local_record')
      .select(['collection', 'rkey', 'cid'])
      .where('space_uri', '=', space)
      .orderBy('collection')
      .orderBy('rkey')
      .execute()
  }

  private async write(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
    mode: 'create' | 'put',
  ) {
    assertValidRecord(collection, value)
    await this.assertSpace(space)
    const cid = await recordCid(value)
    const now = new Date().toISOString()
    const valueJson = JSON.stringify(value)
    await this.db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('local_record')
        .select('cid')
        .where('space_uri', '=', space)
        .where('collection', '=', collection)
        .where('rkey', '=', rkey)
        .executeTakeFirst()
      if (existing && mode === 'create') throw new RecordExists(space, collection, rkey)
      if (existing) {
        await tx
          .updateTable('local_record')
          .set({ value_json: valueJson, cid, updated_at: now })
          .where('space_uri', '=', space)
          .where('collection', '=', collection)
          .where('rkey', '=', rkey)
          .execute()
      } else {
        await tx
          .insertInto('local_record')
          .values({
            space_uri: space,
            collection,
            rkey,
            value_json: valueJson,
            cid,
            updated_at: now,
          })
          .execute()
      }
      await tx
        .insertInto('local_op')
        .values({ space_uri: space, collection, rkey, cid, value_json: valueJson, created_at: now })
        .execute()
    })
    return { cid }
  }

  createRecord(space: string, collection: string, rkey: string, value: JsonRecord) {
    return this.write(space, collection, rkey, value, 'create')
  }

  putRecord(space: string, collection: string, rkey: string, value: JsonRecord) {
    return this.write(space, collection, rkey, value, 'put')
  }

  async deleteRecord(space: string, collection: string, rkey: string): Promise<void> {
    await this.assertSpace(space)
    await this.db.transaction().execute(async (tx) => {
      const result = await tx
        .deleteFrom('local_record')
        .where('space_uri', '=', space)
        .where('collection', '=', collection)
        .where('rkey', '=', rkey)
        .executeTakeFirst()
      if (Number(result.numDeletedRows) === 0) return
      await tx
        .insertInto('local_op')
        .values({
          space_uri: space,
          collection,
          rkey,
          cid: null,
          value_json: null,
          created_at: new Date().toISOString(),
        })
        .execute()
    })
  }

  async listOps(space: string, since?: string | null): Promise<OpsPage> {
    await this.assertSpace(space)
    if (since && !/^\d+$/.test(since)) throw new InvalidCursor(since)
    const rows = await this.db
      .selectFrom('local_op')
      .select(['seq', 'collection', 'rkey', 'cid', 'value_json'])
      .where('space_uri', '=', space)
      .where('seq', '>', since ? Number(since) : 0)
      .orderBy('seq')
      .execute()
    const ops = rows.map((row) => ({
      rev: rev(row.seq),
      collection: row.collection,
      rkey: row.rkey,
      cid: row.cid,
      value: row.value_json ? (JSON.parse(row.value_json) as JsonRecord) : undefined,
    }))
    return { ops, rev: ops.at(-1)?.rev ?? since ?? null }
  }

  async headRev(space: string): Promise<string | null> {
    await this.assertSpace(space)
    const row = await this.db
      .selectFrom('local_op')
      .select((eb) => eb.fn.max('seq').as('seq'))
      .where('space_uri', '=', space)
      .executeTakeFirst()
    return row?.seq ? rev(Number(row.seq)) : null
  }

  async listSpaces(type: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('local_space')
      .select('uri')
      .where('owner_did', '=', this.did)
      .where('type', '=', type)
      .execute()
    return rows.map((row) => row.uri)
  }
}
