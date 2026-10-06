import { randomBytes } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { sql } from 'kysely'
import { type AdminRoutesDeps, adminRoutes } from './admin/routes.ts'
import { requireApiKey } from './auth/api-keys.ts'
import { SessionExpired } from './auth/pds.ts'
import { ADMIN_ROLE } from './auth/roles.ts'
import {
  type AuthDeps,
  accessGate,
  authApiRoutes,
  oauthRoutes,
  originCheck,
  sessionMiddleware,
} from './auth/routes.ts'
import { type BlobRoutesDeps, blobRoutes } from './blobs/routes.ts'
import { InvalidBody } from './body.ts'
import type { Config } from './config.ts'
import { type Cron, CronRunning } from './cron.ts'
import type { Db } from './db/index.ts'
import type { AppEnv } from './env.ts'
import { pdsFailure } from './lex-errors.ts'
import type { Logger } from './logger.ts'
import { type PluginRoutesDeps, pluginRoutes } from './plugins/routes.ts'
import { ModelUnavailable } from './providers/catalog.ts'
import { type ProviderRoutesDeps, providerRoutes } from './providers/routes.ts'
import { safeErrorMessage } from './safe-error.ts'
import { SettingsStore } from './settings/store.ts'
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
  /** Admin settings. Without them the defaults apply. */
  settings?: SettingsStore
  web?: Web
  auth?: AuthDeps
  plugins?: PluginRoutesDeps
  storage?: StorageRoutesDeps
  providers?: ProviderRoutesDeps
  turns?: TurnRoutesDeps
  blobs?: BlobRoutesDeps
  sharing?: SharingService
  sync?: SyncRoutesDeps
  admin?: AdminRoutesDeps
  cron?: Cron
}

export function createApp(deps: AppDeps) {
  const { config, db, logger } = deps
  const settings = deps.settings ?? deps.auth?.settings ?? new SettingsStore(db, logger)
  const appName = () => settings.get('general').appName
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
    app.use('/api/*', sessionMiddleware(deps.auth), originCheck(config), accessGate(deps.auth))
    app.route('/', oauthRoutes(deps.auth))
  }

  const api = new Hono<AppEnv>().get('/health', async (c) => {
    try {
      await sql`select 1`.execute(db)
      return c.json({ status: 'ok' as const, appName: appName() })
    } catch (err) {
      logger.error({ err }, 'health check database query failed')
      return c.json({ status: 'error' as const }, 503)
    }
  })

  // Key routes come before the routers below, whose middleware wants a session.
  const cron = deps.cron
  if (cron)
    api.post('/cron', requireApiKey({ db, logger }, ADMIN_ROLE), async (c) => {
      try {
        return c.json(await cron.run())
      } catch (err) {
        if (err instanceof CronRunning)
          return c.json({ error: 'CronRunning', message: err.message }, 409)
        throw err
      }
    })

  if (deps.auth) api.route('/', authApiRoutes(deps.auth))
  if (deps.plugins) api.route('/plugins', pluginRoutes(deps.plugins))
  if (deps.storage) api.route('/', storageRoutes(deps.storage))
  if (deps.providers) api.route('/', providerRoutes(deps.providers))
  if (deps.turns) api.route('/', turnRoutes(deps.turns))
  if (deps.blobs) api.route('/', blobRoutes(deps.blobs))
  if (deps.sharing) api.route('/', sharingRoutes(deps.sharing))
  if (deps.admin) api.route('/admin', adminRoutes(deps.admin))

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
      return c.json({ error: 'InvalidRequest', message: err.message, issues: err.issues }, 400)
    if (err instanceof InvalidCursor)
      return c.json({ error: 'InvalidRequest', message: err.message }, 400)
    if (err instanceof InvalidSpaceUri)
      return c.json({ error: 'InvalidRequest', message: err.message }, 400)
    if (err instanceof ModelUnavailable)
      return c.json({ error: 'ModelUnavailable', message: err.message }, 400)
    if (err instanceof SpaceNotFound)
      return c.json({ error: 'NotFound', message: err.message }, 404)
    const pds = pdsFailure(err)
    if (pds) {
      logger.warn({ err, path: c.req.path }, 'a PDS call failed')
      return c.json({ error: pds.error, message: pds.message }, pds.status)
    }
    // The reference ties what the user sees to this log line. Details stay in the log outside development.
    const reference = randomBytes(4).toString('hex')
    logger.error({ err, path: c.req.path, reference }, 'unhandled error')
    const detail = config.nodeEnv === 'development' ? `: ${safeErrorMessage(err)}` : '.'
    return c.json(
      {
        error: 'InternalServerError',
        message: `Something went wrong on the server (reference ${reference})${detail}`,
      },
      500,
    )
  })
  app.all('/api/*', (c) => c.json({ error: 'NotFound' }, 404))

  const web = deps.web
  if (web) {
    if (web.assets) app.use('*', serveStatic({ root: web.assets }))
    app.get('*', (c) =>
      web.fetch(c.req.raw, { appName: appName(), fetch: inProcessFetch(app, c.req.raw) }),
    )
  }

  return app
}

export type AppType = ReturnType<typeof createApp>

/** A `fetch` that calls the app in process, as the user whose page is being rendered. */
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
