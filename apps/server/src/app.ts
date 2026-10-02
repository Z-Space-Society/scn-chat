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

/**
 * What the web app's server-side routes receive with each request: the app name, and a `fetch`
 * that calls this app in process as the requesting user, for rendering pages with their data.
 */
export type WebContext = { appName: string; fetch: typeof fetch }

/** The web app: its built client assets, if any, and a handler that renders every other page. */
export type Web = {
  assets?: string
  fetch: (request: Request, context: WebContext) => Promise<Response>
}

export type AppDeps = {
  config: Config
  db: Db
  logger: Logger
  web?: Web
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

  const web = deps.web
  if (web) {
    if (web.assets) app.use('*', serveStatic({ root: web.assets }))
    app.get('*', (c) =>
      web.fetch(c.req.raw, { appName: config.appName, fetch: inProcessFetch(app, c.req.raw) }),
    )
  }

  return app
}

export type AppType = ReturnType<typeof createApp>

/**
 * A `fetch` that calls the app directly, resolving paths against the incoming request and sending
 * its cookie, so a page renders with the requesting user's session. Pages only read during
 * rendering, and the session cookie is only set at login, so no response cookies need passing on.
 */
export function inProcessFetch(app: Hono<AppEnv>, incoming: Request): typeof fetch {
  return (input, init) => {
    const request =
      input instanceof Request
        ? new Request(input, init)
        : new Request(new URL(input, incoming.url), init)
    const cookie = incoming.headers.get('cookie')
    if (cookie && !request.headers.has('cookie')) request.headers.set('cookie', cookie)
    return Promise.resolve(app.fetch(request))
  }
}
