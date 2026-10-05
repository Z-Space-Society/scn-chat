import type { RoleSource } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { addMember, createRole, updateRole } from '../../src/auth/role-store.ts'
import { Roles } from '../../src/auth/roles.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const alice = {
  did: 'did:plc:alice',
  handle: 'alice.example.com',
  pdsUrl: 'https://pds.example.com',
}

function logged() {
  const lines: Record<string, unknown>[] = []
  const logger = pino({ level: 'warn' }, { write: (line: string) => lines.push(JSON.parse(line)) })
  return { logger, lines }
}

describe.each(dialects)('Roles on $name', ({ create }) => {
  async function setup(sources: RoleSource[] = [], sourceTimeoutMs?: number) {
    const db = create()
    await migrateToLatest(db)
    const { logger, lines } = logged()
    const roles = new Roles({
      db,
      adminDids: new Set(['did:plc:boss']),
      sources: () => sources,
      logger,
      sourceTimeoutMs,
    })
    await createRole(db, { name: 'staff', description: '' })
    return { db, roles, lines }
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

  it('includes roles a role source grants, asked on every call', async () => {
    const rolesFor = vi.fn(async () => ['staff'])
    const { roles } = await setup([{ id: 'members', rolesFor }])
    expect(await roles.grantsFor(alice)).toEqual([{ role: 'staff', source: 'plugin:members' }])
    rolesFor.mockResolvedValueOnce([])
    expect(await roles.rolesFor(alice)).toEqual(['user'])
    expect(rolesFor).toHaveBeenCalledWith(alice, { signIn: false })
  })

  it('ignores a failing source with a warning and keeps the others', async () => {
    const { roles, lines } = await setup([
      { id: 'broken', rolesFor: async () => Promise.reject(new Error('down')) },
      { id: 'working', rolesFor: async () => ['staff'] },
    ])
    expect(await roles.rolesFor(alice)).toEqual(['user', 'staff'])
    expect(lines).toContainEqual(expect.objectContaining({ source: 'broken' }))
  })

  it('ignores a source that takes too long', async () => {
    const { roles, lines } = await setup(
      [
        {
          id: 'slow',
          rolesFor: () => new Promise((resolve) => setTimeout(() => resolve(['staff']), 200)),
        },
      ],
      20,
    )
    expect(await roles.rolesFor(alice)).toEqual(['user'])
    expect(lines).toContainEqual(expect.objectContaining({ source: 'slow' }))
  })

  it('ignores unknown roles and admin from a source, with a warning', async () => {
    const { roles, lines } = await setup([{ id: 'greedy', rolesFor: async () => ['admin', 'vip'] }])
    expect(await roles.rolesFor(alice)).toEqual(['user'])
    expect(lines.filter((line) => line.source === 'greedy').map((line) => line.role)).toEqual([
      'admin',
      'vip',
    ])
  })
})
