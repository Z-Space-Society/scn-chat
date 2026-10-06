import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'

export type ApiKeySummary = {
  id: string
  label: string
  roles: string[]
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
}

const hash = (key: string) => createHash('sha256').update(key).digest('hex')

/** Store a new key and return it. This is the only time the key itself is available. */
export async function issueApiKey(
  db: Db,
  key: { label: string; roles: string[] },
  by: string,
): Promise<{ id: string; key: string }> {
  const id = randomUUID()
  const secret = `scn_${randomBytes(32).toString('base64url')}`
  await db
    .insertInto('api_key')
    .values({
      id,
      label: key.label,
      key_hash: hash(secret),
      roles_json: JSON.stringify(key.roles),
      created_by: by,
      created_at: new Date().toISOString(),
      last_used_at: null,
    })
    .execute()
  return { id, key: secret }
}

export async function listApiKeys(db: Db): Promise<ApiKeySummary[]> {
  const rows = await db.selectFrom('api_key').selectAll().orderBy('created_at').execute()
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    roles: JSON.parse(row.roles_json) as string[],
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }))
}

/** Returns false when there is no such key. */
export async function revokeApiKey(db: Db, id: string): Promise<boolean> {
  const result = await db.deleteFrom('api_key').where('id', '=', id).executeTakeFirst()
  return result.numDeletedRows > 0n
}

/** Open a route to API keys holding any of the roles. */
export function requireApiKey(
  deps: { db: Db; logger: Logger },
  ...roles: string[]
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const secret = c.req.header('authorization')?.match(/^Bearer (\S+)$/)?.[1]
    const row =
      secret &&
      (await deps.db
        .selectFrom('api_key')
        .select(['id', 'label', 'roles_json'])
        .where('key_hash', '=', hash(secret))
        .executeTakeFirst())
    if (!row) {
      deps.logger.warn(
        { path: c.req.path, reason: secret ? 'unknown key' : 'no key' },
        'API key refused',
      )
      return c.json({ error: 'Unauthorized' }, 401)
    }
    if (!(JSON.parse(row.roles_json) as string[]).some((role) => roles.includes(role))) {
      deps.logger.warn({ path: c.req.path, key: row.label }, 'API key lacks the route roles')
      return c.json({ error: 'Forbidden' }, 403)
    }
    await deps.db
      .updateTable('api_key')
      .set({ last_used_at: new Date().toISOString() })
      .where('id', '=', row.id)
      .execute()
    deps.logger.info({ path: c.req.path, key: row.label }, 'API key accepted')
    await next()
  }
}
