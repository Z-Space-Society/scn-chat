import { cidForCbor } from '@atproto/common'
import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { LocalRecordStore } from '../../src/storage/local-record-store.ts'
import {
  InvalidCursor,
  InvalidRecord,
  RecordExists,
  SpaceExists,
  SpaceNotFound,
} from '../../src/storage/record-store.ts'
import { spaceUri, toLex } from '../../src/storage/records.ts'
import { dialects } from '../helpers/db.ts'

const did = 'did:plc:alice'
const info = (title?: string) => ({
  $type: nsid.info,
  createdAt: '2026-09-26T00:00:00.000Z',
  ...(title ? { title } : {}),
})

describe.each(dialects)('LocalRecordStore on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    const store = new LocalRecordStore(did, db)
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    return { db, store, space }
  }

  it('creates spaces with the PDS URI format and refuses duplicates', async () => {
    const { store, space, db } = await setup()
    expect(space).toBe(spaceUri(did, nsid.conversation, '3aaaaaaaaaaaa'))
    await expect(store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')).rejects.toBeInstanceOf(
      SpaceExists,
    )
    await db.destroy()
  })

  it('creates, reads, updates, lists, and deletes records', async () => {
    const { store, space, db } = await setup()
    await store.createRecord(space, nsid.info, 'self', info('a'))
    await store.putRecord(space, nsid.info, 'self', info('b'))
    expect((await store.getRecord(space, nsid.info, 'self'))?.value.title).toBe('b')
    expect(await store.listRecords(space, nsid.info)).toHaveLength(1)
    await store.deleteRecord(space, nsid.info, 'self')
    expect(await store.getRecord(space, nsid.info, 'self')).toBeNull()
    await db.destroy()
  })

  it('throws RecordExists when creating over an existing key', async () => {
    const { store, space, db } = await setup()
    await store.createRecord(space, nsid.info, 'self', info())
    await expect(store.createRecord(space, nsid.info, 'self', info())).rejects.toBeInstanceOf(
      RecordExists,
    )
    await db.destroy()
  })

  it('rejects an invalid record before writing', async () => {
    const { store, space, db } = await setup()
    await expect(
      store.putRecord(space, nsid.info, 'self', { $type: nsid.info }),
    ).rejects.toBeInstanceOf(InvalidRecord)
    expect(await store.listKeys(space)).toEqual([])
    await db.destroy()
  })

  it('computes the same CID an independent atproto CBOR encoder does', async () => {
    const { store, space, db } = await setup()
    const record = info('CID check')
    const { cid } = await store.createRecord(space, nsid.info, 'self', record)
    expect(cid).toBe((await cidForCbor(toLex(record))).toString())
    await db.destroy()
  })

  it('lists ops after a revision, including deletes, and reports the head revision', async () => {
    const { store, space, db } = await setup()
    await store.createRecord(space, nsid.info, 'self', info('a'))
    const { rev: first } = await store.listOps(space)
    await store.putRecord(space, nsid.info, 'self', info('b'))
    await store.deleteRecord(space, nsid.info, 'self')
    const page = await store.listOps(space, first)
    expect(page.ops.map((op) => op.cid === null)).toEqual([false, true])
    expect(await store.headRev(space)).toBe(page.rev)
    await db.destroy()
  })

  it('keeps only the newest value in the op log, and none after a delete', async () => {
    const { store, space, db } = await setup()
    await store.createRecord(space, nsid.info, 'self', info('a'))
    await store.putRecord(space, nsid.info, 'self', info('b'))
    expect((await store.listOps(space)).ops.map((op) => op.value?.title)).toEqual([undefined, 'b'])
    await store.deleteRecord(space, nsid.info, 'self')
    const rows = await db
      .selectFrom('local_op')
      .select('value_json')
      .where('space_uri', '=', space)
      .where('value_json', 'is not', null)
      .execute()
    expect(rows).toEqual([])
    await db.destroy()
  })

  it('returns keys and CIDs without values', async () => {
    const { store, space, db } = await setup()
    const { cid } = await store.createRecord(space, nsid.info, 'self', info())
    expect(await store.listKeys(space)).toEqual([{ collection: nsid.info, rkey: 'self', cid }])
    await db.destroy()
  })

  it('deletes a space with its records and ops', async () => {
    const { store, space, db } = await setup()
    await store.createRecord(space, nsid.info, 'self', info())
    await store.deleteSpace(space)
    expect(await store.listSpaces(nsid.conversation)).toEqual([])
    await expect(store.listOps(space)).rejects.toBeInstanceOf(SpaceNotFound)
    const rows = await db
      .selectFrom('local_op')
      .select('seq')
      .where('space_uri', '=', space)
      .execute()
    expect(rows).toEqual([])
    await db.destroy()
  })

  it('raises SpaceNotFound for a space that does not exist, as a PDS does', async () => {
    const { store, db } = await setup()
    const missing = spaceUri(did, nsid.conversation, '3bbbbbbbbbbbb')
    await expect(store.putRecord(missing, nsid.info, 'self', info())).rejects.toBeInstanceOf(
      SpaceNotFound,
    )
    await expect(store.getRecord(missing, nsid.info, 'self')).rejects.toBeInstanceOf(SpaceNotFound)
    await expect(store.listRecords(missing, nsid.message)).rejects.toBeInstanceOf(SpaceNotFound)
    await expect(store.headRev(missing)).rejects.toBeInstanceOf(SpaceNotFound)
    await db.destroy()
  })

  it('rejects a revision cursor that did not come from this store', async () => {
    const { store, space, db } = await setup()
    await expect(store.listOps(space, '3mwhpfnmcvc26')).rejects.toBeInstanceOf(InvalidCursor)
    await db.destroy()
  })
})
