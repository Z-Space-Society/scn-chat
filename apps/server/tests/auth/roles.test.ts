import { describe, expect, it } from 'vitest'
import { recordLogin } from '../../src/auth/accounts.ts'
import {
  addMember,
  addPluginMember,
  createRole,
  listRoles,
  syncMembers,
  updateRole,
} from '../../src/auth/role-store.ts'
import { Roles } from '../../src/auth/roles.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const alice = {
  did: 'did:plc:alice',
  handle: 'alice.example.com',
  pdsUrl: 'https://pds.example.com',
}

describe.each(dialects)('Roles on $name', ({ create }) => {
  async function setup() {
    const db = create()
    await migrateToLatest(db)
    const roles = new Roles({ db, adminDids: new Set(['did:plc:boss']) })
    await createRole(db, { name: 'staff', description: '' })
    return { db, roles }
  }

  it('gives DIDs in ADMIN_DIDS the admin role from the environment', async () => {
    const { roles } = await setup()
    const boss = { ...alice, did: 'did:plc:boss' }
    expect(await roles.grantsFor(boss)).toEqual([{ role: 'admin', source: 'environment' }])
  })

  it('includes explicit members', async () => {
    const { db, roles } = await setup()
    await addMember(db, 'staff', alice.did, 'did:plc:boss')
    expect(await roles.grantsFor(alice)).toEqual([{ role: 'staff', source: 'member' }])
  })

  it('matches the PDS host exactly, and not its subdomains', async () => {
    const { db, roles } = await setup()
    await updateRole(db, 'staff', { pdsHosts: ['pds.example.com'] })
    expect(await roles.rolesFor(alice)).toEqual(['user', 'staff'])
    expect(await roles.rolesFor({ ...alice, pdsUrl: 'https://eu.pds.example.com' })).toEqual([
      'user',
    ])
  })

  it('matches a handle domain and its subdomains, but not names that only end the same', async () => {
    const { db, roles } = await setup()
    await updateRole(db, 'staff', { handleDomains: ['example.com'] })
    expect(await roles.rolesFor(alice)).toEqual(['user', 'staff'])
    expect(await roles.rolesFor({ ...alice, handle: 'example.com' })).toEqual(['user', 'staff'])
    expect(await roles.rolesFor({ ...alice, handle: 'alice.badexample.com' })).toEqual(['user'])
    expect(await roles.rolesFor({ ...alice, handle: null })).toEqual(['user'])
  })

  it('syncs members: drops the unlisted, adds listed accounts, and keeps listed members without one', async () => {
    const { db, roles } = await setup()
    const account = (did: string) =>
      recordLogin(db, { did, handle: null, pdsUrl: 'https://p', spacesAllowed: true })
    await account(alice.did)
    await account('did:plc:dana')
    await addMember(db, 'staff', alice.did, 'did:plc:boss')
    await addMember(db, 'staff', 'did:plc:bob', 'did:plc:boss')
    await addPluginMember(db, 'staff', 'did:plc:carol', 'plugin:members')
    const listed = [alice.did, 'did:plc:carol', 'did:plc:dana', 'did:plc:erin']
    expect(await syncMembers(db, 'staff', listed, 'plugin:members')).toEqual({
      added: 1,
      removed: 1,
    })
    const [, staff] = await listRoles(db)
    expect(staff?.members.map((m) => [m.did, m.addedBy])).toEqual([
      [alice.did, 'did:plc:boss'],
      ['did:plc:carol', 'plugin:members'],
      ['did:plc:dana', 'plugin:members'],
    ])
    expect(await roles.rolesFor(alice)).toEqual(['user', 'staff'])
  })

  it.each([
    ['admin', 'admin', alice.did],
    ['a missing role', 'ghost', alice.did],
    ['an entry that is not a DID', 'staff', 'bob.test'],
  ])('refuses a plugin change to %s, changing nothing', async (_, role, did) => {
    const { db, roles } = await setup()
    await expect(syncMembers(db, role, [did], 'plugin:members')).rejects.toThrow()
    await expect(addPluginMember(db, role, did, 'plugin:members')).rejects.toThrow()
    expect(await roles.rolesFor(alice)).toEqual(['user'])
  })
})
