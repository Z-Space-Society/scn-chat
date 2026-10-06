import { isValidDid } from '@atproto/syntax'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { z } from 'zod'
import { type Access, CannotSuspendAdmin } from '../auth/access.ts'
import { getAccount } from '../auth/accounts.ts'
import { issueApiKey, listApiKeys, revokeApiKey } from '../auth/api-keys.ts'
import type { IdentityResolver } from '../auth/identity.ts'
import { addInvite, listInvites, removeInvite } from '../auth/invites.ts'
import {
  addMember,
  createRole,
  deleteRole,
  listRoles,
  RoleExists,
  removeMember,
  roleExists,
  updateRole,
} from '../auth/role-store.ts'
import { ADMIN_ROLE, IMPLICIT_ROLE } from '../auth/roles.ts'
import { requireAdmin, signedInUser } from '../auth/routes.ts'
import { InvalidBody, jsonBody } from '../body.ts'
import type { Cron } from '../cron.ts'
import type { AppEnv } from '../env.ts'
import type { SettingsStore } from '../settings/store.ts'
import { type PluginAdminRoutesDeps, pluginAdminRoutes } from './plugin-routes.ts'
import { settingsAdminRoutes } from './settings-routes.ts'

export type AdminRoutesDeps = PluginAdminRoutesDeps & {
  access: Access
  cron: Cron
  settings: SettingsStore
  identity: IdentityResolver
}

const PAGE_SIZE = 50
const ROLE_NAME = /^[a-z][a-z0-9-]*$/
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

const hostnames = z.array(
  z.string().trim().toLowerCase().regex(HOSTNAME, 'must be a hostname, such as example.com'),
)

const newRole = z.object({
  name: z.string().regex(ROLE_NAME, `must match ${ROLE_NAME}`),
  description: z.string().default(''),
})

const rolePatch = z.object({
  description: z.string().optional(),
  pdsHosts: hostnames.optional(),
  handleDomains: hostnames.optional(),
})

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

const notFound = (what: string) => ({ error: 'NotFound', message: `${what} not found` }) as const

/** What still names a role, so deleting it would leave a dangling reference. */
async function roleUses(deps: AdminRoutesDeps, name: string): Promise<string[]> {
  const uses: string[] = []
  if (deps.settings.get('access').inviteRoles.includes(name)) uses.push('access')
  const models = await deps.db
    .selectFrom('admin_model')
    .select(['provider', 'model_id', 'roles_json'])
    .execute()
  for (const model of models) {
    if ((JSON.parse(model.roles_json) as string[]).includes(name))
      uses.push(`model ${model.provider}/${model.model_id}`)
  }
  for (const key of await listApiKeys(deps.db)) {
    if (key.roles.includes(name)) uses.push(`API key ${key.label}`)
  }
  return uses
}

/** Turn a handle or DID into a DID, or fail naming what didn't resolve. */
async function resolveIdentifier(deps: AdminRoutesDeps, identifier: string): Promise<string> {
  const trimmed = identifier.trim().replace(/^@/, '')
  if (trimmed.startsWith('did:')) {
    if (!isValidDid(trimmed)) throw new InvalidBody(`"${trimmed}" is not a valid DID`)
    return trimmed
  }
  const did = await deps.identity.resolveHandle(trimmed).catch((err: unknown) => {
    deps.logger.warn({ err, handle: trimmed }, 'resolving a handle for a role member failed')
    return null
  })
  if (!did) throw new InvalidBody(`The handle "${trimmed}" doesn't resolve to an account`)
  return did
}

/** Users, roles, and access. */
function peopleRoutes(deps: AdminRoutesDeps) {
  return new Hono<AppEnv>()
    .get('/users', async (c) => {
      const q = c.req.query('q')?.trim()
      const offset = Number(c.req.query('cursor') ?? 0) || 0
      let query = deps.db
        .selectFrom('account')
        .select([
          'did',
          'handle',
          'pds_url',
          'storage_mode',
          'viewer_only',
          'suspended_at',
          'suspended_by',
          'suspended_reason',
          'created_at',
          'last_active_at',
        ])
        .orderBy('last_active_at', 'desc')
        .orderBy('did')
        .limit(PAGE_SIZE + 1)
        .offset(offset)
      if (q) {
        const prefix = `${escapeLike(q.toLowerCase())}%`
        query = query.where(
          sql<boolean>`(handle like ${prefix} escape '\\' or did like ${prefix} escape '\\')`,
        )
      }
      const rows = await query.execute()
      const users = await Promise.all(
        rows.slice(0, PAGE_SIZE).map(async (row) => ({
          did: row.did,
          handle: row.handle,
          storageMode: row.storage_mode,
          viewerOnly: row.viewer_only === 1,
          suspension: row.suspended_at
            ? { at: row.suspended_at, by: row.suspended_by, reason: row.suspended_reason }
            : null,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at,
          roles: await deps.roles.grantsFor({
            did: row.did,
            handle: row.handle,
            pdsUrl: row.pds_url,
          }),
        })),
      )
      return c.json({
        users,
        cursor: rows.length > PAGE_SIZE ? String(offset + PAGE_SIZE) : null,
      })
    })
    .post('/users', async (c) => {
      const body = await jsonBody(c, z.object({ identifier: z.string().min(1) }))
      const did = await resolveIdentifier(deps, body.identifier)
      const account = await getAccount(deps.db, did)
      if (account && !account.viewerOnly)
        throw new InvalidBody(`${account.handle ?? did} already has an account`)
      const admin = signedInUser(c).did
      await addInvite(deps.db, did, admin)
      deps.logger.info({ admin, did }, 'user added')
      return c.json({ did }, 201)
    })
    .get('/invites', async (c) => {
      const invites = await listInvites(deps.db)
      const dids = invites.map((invite) => invite.did)
      const handles = new Map(
        (dids.length
          ? await deps.db
              .selectFrom('account')
              .select(['did', 'handle'])
              .where('did', 'in', dids)
              .execute()
          : []
        ).map((row) => [row.did, row.handle]),
      )
      return c.json({
        invites: invites.map((invite) => ({ ...invite, handle: handles.get(invite.did) ?? null })),
      })
    })
    .delete('/invites/:did', async (c) => {
      if (!(await removeInvite(deps.db, c.req.param('did')))) return c.json(notFound('Invite'), 404)
      return c.json({ ok: true })
    })
    .post('/users/:did/suspend', async (c) => {
      const did = c.req.param('did')
      const body = await jsonBody(c, z.object({ reason: z.string().max(500).optional() }), {
        optional: true,
      })
      if (!(await getAccount(deps.db, did))) return c.json(notFound('Account'), 404)
      try {
        await deps.access.suspend(did, signedInUser(c).did, body.reason)
      } catch (err) {
        if (err instanceof CannotSuspendAdmin) throw new InvalidBody(err.message)
        throw err
      }
      return c.json({ ok: true })
    })
    .post('/users/:did/restore', async (c) => {
      const did = c.req.param('did')
      if (!(await getAccount(deps.db, did))) return c.json(notFound('Account'), 404)
      await deps.access.restore(did, signedInUser(c).did)
      return c.json({ ok: true })
    })
    .get('/roles', async (c) => {
      const roles = await listRoles(deps.db)
      const dids = [...new Set(roles.flatMap((role) => role.members.map((m) => m.did)))]
      const handles = new Map(
        (dids.length
          ? await deps.db
              .selectFrom('account')
              .select(['did', 'handle'])
              .where('did', 'in', dids)
              .execute()
          : []
        ).map((row) => [row.did, row.handle]),
      )
      return c.json({
        roles: roles.map((role) => ({
          ...role,
          members: role.members.map((member) => ({
            ...member,
            handle: handles.get(member.did) ?? null,
          })),
        })),
        environmentAdmins: [...deps.roles.environmentAdmins()],
      })
    })
    .post('/roles', async (c) => {
      const body = await jsonBody(c, newRole)
      if (body.name === IMPLICIT_ROLE)
        throw new InvalidBody(`"${IMPLICIT_ROLE}" is built in and held by everyone`, [
          { path: ['name'], message: 'is built in' },
        ])
      try {
        await createRole(deps.db, body)
      } catch (err) {
        if (err instanceof RoleExists)
          throw new InvalidBody(err.message, [{ path: ['name'], message: 'already exists' }])
        throw err
      }
      deps.logger.info({ admin: signedInUser(c).did, role: body.name }, 'role created')
      return c.json({ ok: true }, 201)
    })
    .patch('/roles/:name', async (c) => {
      const name = c.req.param('name')
      const body = await jsonBody(c, rolePatch)
      if (!(await updateRole(deps.db, name, body))) return c.json(notFound('Role'), 404)
      deps.logger.info({ admin: signedInUser(c).did, role: name }, 'role changed')
      return c.json({ ok: true })
    })
    .delete('/roles/:name', async (c) => {
      const name = c.req.param('name')
      if (name === ADMIN_ROLE || name === IMPLICIT_ROLE)
        throw new InvalidBody(`The "${name}" role is built in and can't be deleted`)
      if (!(await roleExists(deps.db, name))) return c.json(notFound('Role'), 404)
      const uses = await roleUses(deps, name)
      if (uses.length)
        throw new InvalidBody(`The "${name}" role is still used by: ${uses.join(', ')}`)
      await deleteRole(deps.db, name)
      deps.logger.info({ admin: signedInUser(c).did, role: name }, 'role deleted')
      return c.json({ ok: true })
    })
    .post('/roles/:name/members', async (c) => {
      const name = c.req.param('name')
      const body = await jsonBody(c, z.object({ identifier: z.string().min(1) }))
      if (!(await roleExists(deps.db, name))) return c.json(notFound('Role'), 404)
      const did = await resolveIdentifier(deps, body.identifier)
      const admin = signedInUser(c).did
      await addMember(deps.db, name, did, admin)
      deps.logger.info({ admin, role: name, did }, 'role member added')
      return c.json({ did }, 201)
    })
    .delete('/roles/:name/members/:did', async (c) => {
      const { name, did } = c.req.param()
      if (name === ADMIN_ROLE && deps.roles.isEnvironmentAdmin(did))
        throw new InvalidBody(
          'Admins listed in ADMIN_DIDS can only be removed from the environment',
        )
      if (!(await removeMember(deps.db, name, did))) return c.json(notFound('Member'), 404)
      deps.logger.info({ admin: signedInUser(c).did, role: name, did }, 'role member removed')
      return c.json({ ok: true })
    })
    .get('/access', (c) => c.json(deps.settings.get('access')))
    .put('/access', async (c) => {
      const body = await jsonBody(
        c,
        z.object({
          registration: z.enum(['open', 'invite', 'closed']),
          inviteRoles: z.array(z.string()).default([]),
        }),
      )
      const known = await deps.roles.names()
      const unknown = body.inviteRoles.filter((role) => !known.has(role))
      if (unknown.length)
        throw new InvalidBody(`No such role: ${unknown.join(', ')}`, [
          { path: ['inviteRoles'], message: `No such role: ${unknown.join(', ')}` },
        ])
      return c.json(await deps.settings.set('access', body, signedInUser(c).did))
    })
}

/** Issuing and revoking API keys. */
function apiKeyRoutes(deps: AdminRoutesDeps) {
  return new Hono<AppEnv>()
    .get('/api-keys', async (c) => c.json({ keys: await listApiKeys(deps.db) }))
    .post('/api-keys', async (c) => {
      const body = await jsonBody(
        c,
        z.object({ label: z.string().trim().min(1), roles: z.array(z.string()).min(1) }),
      )
      const known = await deps.roles.names()
      const unknown = body.roles.filter((role) => !known.has(role))
      if (unknown.length)
        throw new InvalidBody(`No such role: ${unknown.join(', ')}`, [
          { path: ['roles'], message: `No such role: ${unknown.join(', ')}` },
        ])
      const admin = signedInUser(c).did
      const issued = await issueApiKey(deps.db, body, admin)
      deps.logger.info({ admin, key: body.label, roles: body.roles }, 'API key issued')
      return c.json(issued, 201)
    })
    .delete('/api-keys/:id', async (c) => {
      if (!(await revokeApiKey(deps.db, c.req.param('id')))) return c.json(notFound('API key'), 404)
      deps.logger.info({ admin: signedInUser(c).did, id: c.req.param('id') }, 'API key revoked')
      return c.json({ ok: true })
    })
}

/** Everything in the admin area, for admins only. */
export function adminRoutes(deps: AdminRoutesDeps) {
  return new Hono<AppEnv>()
    .use(requireAdmin)
    .route('/', peopleRoutes(deps))
    .route('/', apiKeyRoutes(deps))
    .get('/cron', async (c) => c.json({ lastRun: await deps.cron.lastRun() }))
    .route('/', pluginAdminRoutes(deps))
    .route('/', settingsAdminRoutes(deps))
}
