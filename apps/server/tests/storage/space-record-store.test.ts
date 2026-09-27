import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { RecordExists, SpaceExists, SpaceNotFound } from '../../src/storage/record-store.ts'
import { SpaceRecordStore } from '../../src/storage/space-record-store.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { FakePds } from '../helpers/fake-pds.ts'

const did = 'did:plc:alice'
const info = { $type: nsid.info, createdAt: '2026-09-26T00:00:00.000Z' }

async function setup() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const pds = await FakePds.create(db)
  const store = new SpaceRecordStore(did, async () => pds.client(did) as never)
  return { pds, store }
}

describe('SpaceRecordStore', () => {
  it('creates spaces with member-list policies and open app access', async () => {
    const { pds, store } = await setup()
    await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    expect(pds.calls[0]?.input).toMatchObject({
      readPolicy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' },
      writePolicy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' },
      appAccess: { $type: 'com.atproto.simplespace.defs#open' },
    })
  })

  it('maps SpaceAlreadyExists to SpaceExists', async () => {
    const { store } = await setup()
    await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    await expect(store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')).rejects.toBeInstanceOf(
      SpaceExists,
    )
  })

  it('writes records to the user repo without PDS validation', async () => {
    const { pds, store } = await setup()
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    await store.putRecord(space, nsid.info, 'self', info)
    expect(pds.calls.at(-1)?.input).toMatchObject({ repo: did, validate: false })
  })

  it('maps RecordAlreadyExists to RecordExists', async () => {
    const { store } = await setup()
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    await store.createRecord(space, nsid.info, 'self', info)
    await expect(store.createRecord(space, nsid.info, 'self', info)).rejects.toBeInstanceOf(
      RecordExists,
    )
  })

  it('returns null for a missing record and throws SpaceNotFound for a missing space', async () => {
    const { store } = await setup()
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    expect(await store.getRecord(space, nsid.info, 'self')).toBeNull()
    await expect(store.putRecord(`${space}x`, nsid.info, 'self', info)).rejects.toBeInstanceOf(
      SpaceNotFound,
    )
  })

  it('round-trips record values as JSON', async () => {
    const { store } = await setup()
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    await store.putRecord(space, nsid.info, 'self', { ...info, title: 'hello' })
    expect((await store.getRecord(space, nsid.info, 'self'))?.value).toEqual({
      ...info,
      title: 'hello',
    })
    expect((await store.listRecords(space, nsid.info))[0]?.value).toEqual({
      ...info,
      title: 'hello',
    })
  })

  it('lists ops with the commit and keys without values', async () => {
    const { store, pds } = await setup()
    const space = await store.createSpace(nsid.conversation, '3aaaaaaaaaaaa')
    const { cid } = await store.putRecord(space, nsid.info, 'self', info)
    const page = await store.listOps(space)
    expect(page.ops).toHaveLength(1)
    expect(page.commit).toBeDefined()
    expect(await store.listKeys(space)).toEqual([{ collection: nsid.info, rkey: 'self', cid }])
    expect(await store.headRev(space)).toBe(page.rev)
  })

  it('fails when the op log reaches its head without a signed commit', async () => {
    const client = { call: async () => ({ ops: [] }) }
    const store = new SpaceRecordStore(did, async () => client as never)
    await expect(
      store.listOps(`at://${did}/space/${nsid.conversation}/3aaaaaaaaaaaa`),
    ).rejects.toThrow(/without a commit/)
  })
})
