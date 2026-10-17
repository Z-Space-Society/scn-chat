import { Hono } from 'hono'
import { z } from 'zod'
import { requireApiKey } from '../auth/api-keys.ts'
import { ADMIN_ROLE } from '../auth/roles.ts'
import { jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'
import type { SiteConfig } from './site-config.ts'

/** The whole admin configuration, for `site-config` and other callers with an admin key. */
export function siteConfigRoutes(deps: { db: Db; logger: Logger; siteConfig: SiteConfig }) {
  return new Hono<AppEnv>()
    .use(requireApiKey(deps, ADMIN_ROLE))
    .get('/', async (c) => c.json(await deps.siteConfig.export()))
    .put('/', async (c) => {
      const raw = await jsonBody(c, z.unknown())
      const key = c.get('apiKey')
      if (!key) throw new Error('requireApiKey let a request through without a key')
      return c.json(await deps.siteConfig.apply(raw, `api-key:${key.id}`))
    })
}
