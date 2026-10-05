import type { RoleSource } from '@scn-chat/plugin-api'
import pino from 'pino'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.ts'
import { Access, CannotSuspendAdmin } from '../../src/auth/access.ts'
import { getAccount, recordLogin } from '../../src/auth/accounts.ts'
import { addInvite, isInvited } from '../../src/auth/invites.ts'
import { addMember, createRole } from '../../src/auth/role-store.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import type { Settings } from '../../src/settings/schemas.ts'
import {
  authDeps,
  fakeOAuth,
  fakeSession,
  LOGIN_STATE,
  ORIGIN,
  sessionCookie,
} from '../helpers/auth.ts'
import { testConfig } from '../helpers/config.ts'
import { createSqliteDb } from '../helpers/db.ts'
import { testRoles, testSettings } from '../helpers/settings.ts'

const SHARE = '/s/did:plc:owner/3aaaaaaaaaaaa'
const logger = pino({ level: 'silent' })

/** An app whose sign-ins are for whichever DID `as` names. */
async function setup(values: Partial<Settings> = {}, sources: RoleSource[] = []) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const settings = testSettings(db, values)
  const roles = testRoles(db, { sources: () => sources })
  const access = new Access({ db, roles, settings, logger })
  const onLogin = vi.fn(async () => {})
  let as = 'did:plc:alice'
  const oauth = fakeOAuth({
    callback: vi.fn(async () => ({ session: fakeSession(as, 'atproto'), state: LOGIN_STATE })),
  })
  const auth = authDeps(db, { oauth, roles, access, settings, onLogin })
  const app = createApp({ config: testConfig(), db, logger, auth })
  const signIn = (did = 'did:plc:alice', next?: string) => {
    as = did
    return app.request('/oauth/callback?code=a&state=b', {
      headers: {
        cookie: `scn_login=${LOGIN_STATE}${next ? `; scn_next=${encodeURIComponent(next)}` : ''}`,
      },
    })
  }
  const me = async (cookie: string) =>
    (await (await app.request('/api/me', { headers: { cookie } })).json()) as Record<
      string,
      unknown
    >
  const chats = (cookie: string) => app.request('/api/conversations', { headers: { cookie } })
  return { db, app, oauth, onLogin, settings, access, signIn, me, chats }
}

const errorOf = (res: Response) =>
  new URL(res.headers.get('location') ?? '', 'http://x').searchParams.get('error') ?? ''

describe('registration modes', () => {
  it('lets anyone create an account on a fresh install', async () => {
    const { signIn, onLogin } = await setup()
    expect((await signIn()).headers.get('location')).toBe('/')
    expect(onLogin).toHaveBeenCalled()
  })

  it('in invite mode lets in holders of an invite role and added people, and turns away anyone else', async () => {
    const { db, signIn } = await setup({
      access: { registration: 'invite', inviteRoles: ['member'] },
    })
    await createRole(db, { name: 'member', description: '' })
    await addMember(db, 'member', 'did:plc:alice', 'did:plc:admin')
    await addInvite(db, 'did:plc:bob', 'did:plc:admin')
    expect((await signIn('did:plc:alice')).headers.get('location')).toBe('/')
    expect((await signIn('did:plc:bob')).headers.get('location')).toBe('/')
    expect(errorOf(await signIn('did:plc:carol'))).toContain('did:plc:carol')
  })

  it('in invite mode counts roles a role source grants', async () => {
    const { db, signIn } = await setup(
      { access: { registration: 'invite', inviteRoles: ['member'] } },
      [
        {
          id: 'applications',
          rolesFor: async ({ did }) => (did === 'did:plc:alice' ? ['member'] : []),
        },
      ],
    )
    await createRole(db, { name: 'member', description: '' })
    expect((await signIn()).headers.get('location')).toBe('/')
  })

  it('tells role sources whether they are asked for a sign-in or a request', async () => {
    const rolesFor = vi.fn(async () => [])
    const { signIn, chats } = await setup({}, [{ id: 'members', rolesFor }])
    const cookie = sessionCookie(await signIn())
    expect(rolesFor).toHaveBeenLastCalledWith(expect.anything(), { signIn: true })
    await chats(cookie)
    expect(rolesFor).toHaveBeenLastCalledWith(expect.anything(), { signIn: false })
  })

  it('in closed mode lets in only added people and admins', async () => {
    const { db, signIn } = await setup({ access: { registration: 'closed', inviteRoles: [] } })
    await addInvite(db, 'did:plc:bob', 'did:plc:admin')
    expect((await signIn('did:plc:admin')).headers.get('location')).toBe('/')
    expect((await signIn('did:plc:bob')).headers.get('location')).toBe('/')
    expect(errorOf(await signIn('did:plc:alice'))).toContain('did:plc:alice')
  })

  it('revokes a turned-away user OAuth session and creates no account', async () => {
    const { db, oauth, onLogin, signIn } = await setup({
      access: { registration: 'closed', inviteRoles: [] },
    })
    await signIn()
    expect(oauth.revoke).toHaveBeenCalledWith('did:plc:alice')
    expect(await getAccount(db, 'did:plc:alice')).toBeUndefined()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('keeps an existing account working when the mode changes', async () => {
    const { settings, signIn, chats } = await setup()
    const cookie = sessionCookie(await signIn())
    await settings.set('access', { registration: 'closed' }, 'did:plc:admin')
    expect((await chats(cookie)).status).not.toBe(403)
    expect((await signIn()).headers.get('location')).toBe('/')
  })

  it('deletes the added person row once they create an account', async () => {
    const { db, signIn } = await setup({ access: { registration: 'closed', inviteRoles: [] } })
    await addInvite(db, 'did:plc:alice', 'did:plc:admin')
    await signIn()
    expect(await isInvited(db, 'did:plc:alice')).toBe(false)
  })
})

describe('suspension', () => {
  it('refuses the chat app to a suspended account without its reason, and keeps its session for shared chats', async () => {
    const { access, signIn, chats, me } = await setup()
    const cookie = sessionCookie(await signIn())
    await access.suspend('did:plc:alice', 'did:plc:admin', 'Spamming.')
    const res = await chats(cookie)
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; message: string }
    expect(body.error).toBe('AccessDenied')
    expect(body.message).not.toContain('Spamming')
    expect(await me(cookie)).toMatchObject({ access: 'viewer' })
    expect(await access.hasAccess('did:plc:alice')).toBe(false)
  })

  it('turns away a suspended user at the login page, and gives them a viewer session from a share link', async () => {
    const { access, signIn, me } = await setup()
    await signIn()
    await access.suspend('did:plc:alice', 'did:plc:admin', 'Chargeback, see ticket 123')
    const turnedAway = await signIn()
    expect(errorOf(turnedAway)).not.toBe('')
    expect(turnedAway.headers.get('location')).not.toContain('ticket')
    const viewer = await signIn('did:plc:alice', SHARE)
    expect(viewer.headers.get('location')).toBe(SHARE)
    expect(await me(sessionCookie(viewer))).toMatchObject({ access: 'viewer' })
  })

  it('gives access back on the next request after a restore', async () => {
    const { access, signIn, chats } = await setup()
    const cookie = sessionCookie(await signIn())
    await access.suspend('did:plc:alice', 'did:plc:admin')
    expect(await access.restore('did:plc:alice', 'did:plc:admin')).toBe(true)
    expect((await chats(cookie)).status).not.toBe(403)
    expect(await access.restore('did:plc:alice', 'did:plc:admin')).toBe(false)
  })

  it('records who suspended an account, and reports whether anything changed', async () => {
    const { db, access, signIn } = await setup()
    await signIn()
    expect(await access.suspend('did:plc:alice', 'plugin:members', 'Revoked')).toBe(true)
    expect(await access.suspend('did:plc:alice', 'plugin:members')).toBe(false)
    expect(await access.suspend('did:plc:nobody', 'plugin:members')).toBe(false)
    expect((await getAccount(db, 'did:plc:alice'))?.suspension).toMatchObject({
      by: 'plugin:members',
      reason: 'Revoked',
    })
  })

  it('never suspends an admin', async () => {
    const { access, signIn } = await setup()
    await signIn('did:plc:admin')
    await expect(access.suspend('did:plc:admin', 'plugin:members')).rejects.toBeInstanceOf(
      CannotSuspendAdmin,
    )
  })
})

describe('viewers', () => {
  const closed = { access: { registration: 'closed' as const, inviteRoles: [] } }

  it('signs in someone who may not create an account from a share link as a viewer', async () => {
    const { db, oauth, onLogin, signIn, me } = await setup(closed)
    const res = await signIn('did:plc:alice', SHARE)
    expect(res.headers.get('location')).toBe(SHARE)
    expect(oauth.revoke).not.toHaveBeenCalled()
    expect(onLogin).not.toHaveBeenCalled()
    expect((await getAccount(db, 'did:plc:alice'))?.viewerOnly).toBe(true)
    expect(await me(sessionCookie(res))).toMatchObject({
      access: 'viewer',
      admin: false,
      accessMessage: expect.stringContaining('did:plc:alice'),
    })
  })

  it('keeps a viewer to /api/me, logout, and shared chats', async () => {
    const { app, signIn, chats } = await setup(closed)
    const cookie = sessionCookie(await signIn('did:plc:alice', SHARE))
    const blocked = await chats(cookie)
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toMatchObject({ error: 'AccessDenied' })
    expect((await app.request('/api/me', { headers: { cookie } })).status).toBe(200)
    expect((await app.request('/api/shared/did:plc:owner/x', { headers: { cookie } })).status).toBe(
      404,
    )
    const logout = await app.request('/api/logout', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN },
    })
    expect(logout.status).toBe(200)
  })

  it('gives someone who may create an account a full account through a share link', async () => {
    const { onLogin, signIn, me } = await setup()
    const res = await signIn('did:plc:alice', SHARE)
    expect(await me(sessionCookie(res))).toMatchObject({ access: 'full', accessMessage: null })
    expect(onLogin).toHaveBeenCalled()
  })

  it('asks a viewer who may now create an account to sign in again, which sets them up', async () => {
    const { db, onLogin, settings, signIn, me, chats } = await setup(closed)
    const cookie = sessionCookie(await signIn('did:plc:alice', SHARE))
    await settings.set('access', { registration: 'open' }, 'did:plc:admin')
    expect(await me(cookie)).toMatchObject({ access: 'viewer' })
    expect((await chats(cookie)).status).toBe(403)
    expect(await me(sessionCookie(await signIn()))).toMatchObject({ access: 'full' })
    expect(onLogin).toHaveBeenCalledOnce()
    expect((await getAccount(db, 'did:plc:alice'))?.viewerOnly).toBe(false)
  })
})

describe('Access.hasAccess', () => {
  it('is true for full accounts, and false for viewers, suspended accounts, and unknown DIDs', async () => {
    const db = createSqliteDb()
    await migrateToLatest(db)
    const access = new Access({ db, roles: testRoles(db), settings: testSettings(db), logger })
    const base = { handle: null, pdsUrl: 'https://pds.test', spacesAllowed: true }
    await recordLogin(db, { ...base, did: 'did:plc:full' })
    await recordLogin(db, { ...base, did: 'did:plc:viewer', viewer: true })
    await recordLogin(db, { ...base, did: 'did:plc:gone' })
    await access.suspend('did:plc:gone', 'did:plc:admin')
    expect(await access.hasAccess('did:plc:full')).toBe(true)
    expect(await access.hasAccess('did:plc:viewer')).toBe(false)
    expect(await access.hasAccess('did:plc:gone')).toBe(false)
    expect(await access.hasAccess('did:plc:nobody')).toBe(false)
  })
})
