import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { SessionExpired } from './auth/pds.ts'
import {
  type AuthDeps,
  authApiRoutes,
  oauthRoutes,
  originCheck,
  sessionMiddleware,
} from './auth/routes.ts'
import { type BlobRoutesDeps, blobRoutes } from './blobs/routes.ts'
import { InvalidBody } from './body.ts'
import type { Config } from './config.ts'
import type { Db } from './db/index.ts'
import type { AppEnv } from './env.ts'
import type { Logger } from './logger.ts'
import { type PluginRoutesDeps, pluginRoutes } from './plugins/routes.ts'
import { ModelUnavailable } from './providers/catalog.ts'
import { type ProviderRoutesDeps, providerRoutes } from './providers/routes.ts'
import { sharingRoutes } from './sharing/routes.ts'
import type { SharingService } from './sharing/service.ts'
import {
  InvalidCursor,
  InvalidRecord,
  InvalidStoredRecord,
  SpaceNotFound,
} from './storage/record-store.ts'
import { InvalidSpaceUri } from './storage/records.ts'
import { type StorageRoutesDeps, storageRoutes } from './storage/routes.ts'
import { type SyncRoutesDeps, syncRoutes } from './sync/routes.ts'
import { type TurnRoutesDeps, turnRoutes } from './turns/routes.ts'
import { renderIndexHtml } from './web-html.ts'

export type AppDeps = {
  config: Config
  db: Db
  logger: Logger
  /** Built web app to serve, in production. */
  webDist?: string
  auth?: AuthDeps
  plugins?: PluginRoutesDeps
  storage?: StorageRoutesDeps
  providers?: ProviderRoutesDeps
  turns?: TurnRoutesDeps
  blobs?: BlobRoutesDeps
  sharing?: SharingService
  sync?: SyncRoutesDeps
}

export function createApp(deps: AppDeps) {
  const { config, db, logger } = deps
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    const start = performance.now()
    await next()
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Math.round(performance.now() - start),
      },
      'request',
    )
  })

  if (deps.auth) {
    app.use('/api/*', sessionMiddleware(deps.auth), originCheck(config))
    app.route('/', oauthRoutes(deps.auth))
  }

  const api = new Hono<AppEnv>().get('/health', async (c) => {
    try {
      await sql`select 1`.execute(db)
      return c.json({ status: 'ok' as const, appName: config.appName })
    } catch (err) {
      logger.error({ err }, 'health check database query failed')
      return c.json({ status: 'error' as const }, 503)
    }
  })

  if (deps.auth) api.route('/', authApiRoutes(deps.auth))
  if (deps.plugins) api.route('/plugins', pluginRoutes(deps.plugins))
  if (deps.storage) api.route('/', storageRoutes(deps.storage))
  if (deps.providers) api.route('/', providerRoutes(deps.providers))
  if (deps.turns) api.route('/', turnRoutes(deps.turns))
  if (deps.blobs) api.route('/', blobRoutes(deps.blobs))
  if (deps.sharing) api.route('/', sharingRoutes(deps.sharing))
  api.notFound((c) => c.json({ error: 'NotFound' }, 404))

  app.route('/api', api)
  if (deps.sync) app.route('/', syncRoutes(deps.sync))

  app.onError((err, c) => {
    if (err instanceof SessionExpired)
      return c.json({ error: 'SessionExpired', message: err.message }, 401)
    if (err instanceof InvalidRecord)
      return c.json({ error: 'InvalidRecord', message: err.message }, 400)
    if (err instanceof InvalidStoredRecord) {
      logger.warn({ err, path: c.req.path }, 'a stored record does not match its lexicon')
      return c.json({ error: 'InvalidStoredRecord', message: err.message }, 502)
    }
    if (err instanceof InvalidBody)
      return c.json({ error: 'InvalidRequest', message: err.message }, 400)
    if (err instanceof InvalidCursor)
      return c.json({ error: 'InvalidRequest', message: err.message }, 400)
    if (err instanceof InvalidSpaceUri)
      return c.json({ error: 'InvalidRequest', message: err.message }, 400)
    if (err instanceof ModelUnavailable)
      return c.json({ error: 'ModelUnavailable', message: err.message }, 400)
    if (err instanceof SpaceNotFound)
      return c.json({ error: 'NotFound', message: err.message }, 404)
    logger.error({ err, path: c.req.path }, 'unhandled error')
    return c.json({ error: 'InternalServerError' }, 500)
  })
  app.all('/api/*', (c) => c.json({ error: 'NotFound' }, 404))

  if (deps.webDist) {
    const index = renderIndexHtml(
      readFileSync(join(deps.webDist, 'index.html'), 'utf8'),
      config.appName,
    )
    app.get('/', (c) => c.html(index))
    app.get('/index.html', (c) => c.html(index))
    app.use('*', serveStatic({ root: deps.webDist }))
    app.get('*', (c) => c.html(index))
  }

  return app
}

export type AppType = ReturnType<typeof createApp>
