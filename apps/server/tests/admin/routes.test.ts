import { describe, expect, it, vi } from 'vitest'
import { recordLogin } from '../../src/auth/accounts.ts'
import { saveAdminModel } from '../../src/providers/admin-models.ts'
import { adminHarness } from '../helpers/admin.ts'
import { TEST_ADMIN } from '../helpers/config.ts'

const caps = { vision: false, reasoning: false, tools: false }

describe('admin checks', () => {
  it('refuses every admin route to a user who is not an admin', async () => {
    const h = await adminHarness()
    for (const path of [
      '/admin/users',
      '/admin/roles',
      '/admin/access',
      '/admin/plugins',
      '/admin/settings',
    ]) {
      expect((await h.call('GET', path, undefined, 'did:plc:alice')).status).toBe(403)
    }
  })
})

describe('users', () => {
  it('pages through accounts 50 at a time, most recently active first, with their roles', async () => {
    const h = await adminHarness()
    const base = { handle: null, pdsUrl: 'https://pds.test', spacesAllowed: true }
    for (let i = 0; i < 55; i++) {
      await recordLogin(
        h.db,
        { ...base, did: `did:plc:user${String(i).padStart(2, '0')}` },
        new Date(Date.UTC(2026, 0, 1, 0, i)),
      )
    }
    const first = await h.call('GET', '/admin/users')
    const users = first.body.users as { did: string; roles: unknown[] }[]
    expect(users).toHaveLength(50)
    expect(users[0]).toMatchObject({
      did: TEST_ADMIN,
      roles: [{ role: 'admin', source: 'environment' }],
    })
    expect(users[1]?.did).toBe('did:plc:user54')
    const second = await h.call('GET', `/admin/users?cursor=${first.body.cursor}`)
    expect((second.body.users as unknown[]).length).toBe(6)
    expect(second.body.cursor).toBeNull()
  })

  it('filters by the start of a handle or DID', async () => {
    const h = await adminHarness()
    await recordLogin(h.db, {
      did: 'did:plc:bob',
      handle: 'bob.test',
      pdsUrl: 'https://p',
      spacesAllowed: true,
    })
    await recordLogin(h.db, {
      did: 'did:plc:carol',
      handle: 'carol.test',
      pdsUrl: 'https://p',
      spacesAllowed: true,
    })
    const byHandle = await h.call('GET', '/admin/users?q=bo')
    expect((byHandle.body.users as { did: string }[]).map((u) => u.did)).toEqual(['did:plc:bob'])
    const byDid = await h.call('GET', '/admin/users?q=did:plc:car')
    expect((byDid.body.users as { did: string }[]).map((u) => u.did)).toEqual(['did:plc:carol'])
    expect(((await h.call('GET', '/admin/users?q=%25')).body.users as unknown[]).length).toBe(0)
  })
})

describe('roles', () => {
  it('creates a role, adds a member by handle, and lists both', async () => {
    const h = await adminHarness()
    vi.mocked(h.identity.resolveHandle).mockResolvedValueOnce('did:plc:bob')
    expect(
      (await h.call('POST', '/admin/roles', { name: 'member', description: 'Members' })).status,
    ).toBe(201)
    const added = await h.call('POST', '/admin/roles/member/members', { identifier: '@bob.test' })
    expect(added).toMatchObject({ status: 201, body: { did: 'did:plc:bob' } })
    const roles = (await h.call('GET', '/admin/roles')).body
    expect(roles.environmentAdmins).toEqual([TEST_ADMIN])
    expect(roles.roles).toContainEqual(
      expect.objectContaining({
        name: 'member',
        description: 'Members',
        members: [expect.objectContaining({ did: 'did:plc:bob', addedBy: TEST_ADMIN })],
      }),
    )
  })

  it('refuses a handle that does not resolve, and an invalid DID', async () => {
    const h = await adminHarness()
    vi.mocked(h.identity.resolveHandle).mockResolvedValueOnce(null)
    const handle = await h.call('POST', '/admin/roles/admin/members', { identifier: 'ghost.test' })
    expect(handle.status).toBe(400)
    expect(handle.body.message).toMatch(/ghost\.test/)
    const did = await h.call('POST', '/admin/roles/admin/members', { identifier: 'did:nope' })
    expect(did.status).toBe(400)
  })

  it('refuses invalid names, duplicates, and the built-in names', async () => {
    const h = await adminHarness()
    expect((await h.call('POST', '/admin/roles', { name: 'Bad Name' })).status).toBe(400)
    expect((await h.call('POST', '/admin/roles', { name: 'user' })).status).toBe(400)
    expect((await h.call('POST', '/admin/roles', { name: 'admin' })).status).toBe(400)
    expect((await h.call('DELETE', '/admin/roles/admin')).status).toBe(400)
    expect((await h.call('DELETE', '/admin/roles/nope')).status).toBe(404)
  })

  it('saves PDS hosts and handle domains, lowercased, and refuses ones that are not hostnames', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles', { name: 'member' })
    const bad = await h.call('PATCH', '/admin/roles/member', { pdsHosts: ['https://pds.test/'] })
    expect(bad.status).toBe(400)
    expect(bad.body.issues).toEqual([expect.objectContaining({ path: ['pdsHosts', 0] })])
    await h.call('PATCH', '/admin/roles/member', {
      pdsHosts: ['PDS.Example.com'],
      handleDomains: ['example.com'],
    })
    const role = ((await h.call('GET', '/admin/roles')).body.roles as { name: string }[]).find(
      (r) => r.name === 'member',
    )
    expect(role).toMatchObject({ pdsHosts: ['pds.example.com'], handleDomains: ['example.com'] })
  })

  it('applies a role change on the next request, without signing in again', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles', { name: 'member' })
    await h.signIn('did:plc:alice')
    expect((await h.call('GET', '/me', undefined, 'did:plc:alice')).body.roles).toEqual(['user'])
    await h.call('POST', '/admin/roles/member/members', { identifier: 'did:plc:alice' })
    expect((await h.call('GET', '/me', undefined, 'did:plc:alice')).body.roles).toEqual([
      'user',
      'member',
    ])
  })

  it('refuses to delete a role named by access or an admin model, listing what names it', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles', { name: 'member' })
    await h.call('PUT', '/admin/access', { registration: 'invite', inviteRoles: ['member'] })
    await saveAdminModel(
      h.db,
      {
        provider: 'fake',
        id: 'm',
        name: 'M',
        capabilities: caps,
        roles: ['member'],
        default: false,
      },
      TEST_ADMIN,
    )
    const res = await h.call('DELETE', '/admin/roles/member')
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('access')
    expect(res.body.message).toContain('fake/m')
  })

  it('deletes an unused role with its members', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles', { name: 'member' })
    await h.call('POST', '/admin/roles/member/members', { identifier: 'did:plc:alice' })
    expect((await h.call('DELETE', '/admin/roles/member')).status).toBe(200)
    const names = ((await h.call('GET', '/admin/roles')).body.roles as { name: string }[]).map(
      (r) => r.name,
    )
    expect(names).toEqual(['admin'])
  })

  it('removes explicit members, but not admins from the environment', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/roles/admin/members', { identifier: 'did:plc:alice' })
    expect((await h.call('DELETE', '/admin/roles/admin/members/did:plc:alice')).status).toBe(200)
    expect((await h.call('DELETE', '/admin/roles/admin/members/did:plc:alice')).status).toBe(404)
    expect((await h.call('DELETE', `/admin/roles/admin/members/${TEST_ADMIN}`)).status).toBe(400)
  })
})

describe('access', () => {
  it('saves the registration mode and invite roles, and refuses roles that do not exist', async () => {
    const h = await adminHarness()
    const bad = await h.call('PUT', '/admin/access', {
      registration: 'invite',
      inviteRoles: ['ghost'],
    })
    expect(bad.status).toBe(400)
    expect(bad.body.issues).toEqual([expect.objectContaining({ path: ['inviteRoles'] })])
    expect((await h.call('PUT', '/admin/access', { registration: 'nope' })).status).toBe(400)
    expect(
      (await h.call('PUT', '/admin/access', { registration: 'invite', inviteRoles: ['admin'] }))
        .body,
    ).toEqual({ registration: 'invite', inviteRoles: ['admin'] })
  })
})

describe('added users', () => {
  it('adds a person by handle so they can create an account on a closed server', async () => {
    const h = await adminHarness()
    await h.call('PUT', '/admin/access', { registration: 'closed' })
    vi.mocked(h.identity.resolveHandle).mockResolvedValueOnce('did:plc:bob')
    expect(await h.call('POST', '/admin/users', { identifier: 'bob.test' })).toMatchObject({
      status: 201,
      body: { did: 'did:plc:bob' },
    })
    expect((await h.call('GET', '/admin/invites')).body.invites).toEqual([
      expect.objectContaining({ did: 'did:plc:bob', addedBy: TEST_ADMIN }),
    ])
    expect((await h.signIn('did:plc:bob')).headers.get('location')).toBe('/')
    expect((await h.call('GET', '/admin/invites')).body.invites).toEqual([])
  })

  it('refuses to add someone who already has an account', async () => {
    const h = await adminHarness()
    await h.signIn('did:plc:alice')
    expect((await h.call('POST', '/admin/users', { identifier: 'did:plc:alice' })).status).toBe(400)
    expect((await h.call('GET', '/admin/invites')).body.invites).toEqual([])
  })

  it('removes an added person who has not signed in', async () => {
    const h = await adminHarness()
    await h.call('POST', '/admin/users', { identifier: 'did:plc:bob' })
    expect((await h.call('DELETE', '/admin/invites/did:plc:bob')).status).toBe(200)
    expect((await h.call('DELETE', '/admin/invites/did:plc:bob')).status).toBe(404)
  })
})

describe('suspending users', () => {
  it('suspends and restores an account, and lists the suspension', async () => {
    const h = await adminHarness()
    await h.signIn('did:plc:alice')
    expect(
      (await h.call('POST', '/admin/users/did:plc:alice/suspend', { reason: 'Spam' })).status,
    ).toBe(200)
    expect((await h.call('GET', '/conversations', undefined, 'did:plc:alice')).status).toBe(403)
    const users = (await h.call('GET', '/admin/users')).body.users as {
      did: string
      suspension: unknown
    }[]
    expect(users.find((u) => u.did === 'did:plc:alice')?.suspension).toMatchObject({
      by: TEST_ADMIN,
      reason: 'Spam',
    })
    await h.call('POST', '/admin/users/did:plc:alice/restore')
    expect((await h.call('GET', '/conversations', undefined, 'did:plc:alice')).status).not.toBe(403)
  })

  it('refuses to suspend an admin, and answers 404 for an unknown account', async () => {
    const h = await adminHarness()
    await h.signIn(TEST_ADMIN)
    expect((await h.call('POST', `/admin/users/${TEST_ADMIN}/suspend`)).status).toBe(400)
    expect((await h.call('POST', '/admin/users/did:plc:nobody/suspend')).status).toBe(404)
  })
})
