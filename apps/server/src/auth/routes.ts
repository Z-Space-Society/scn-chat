import { Hono, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Config } from '../config.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv, AuthUser } from '../env.ts'
import type { Logger } from '../logger.ts'
import { type Account, getAccount, recordLogin, touchActivity } from './accounts.ts'
import type { IdentityResolver } from './identity.ts'
import type { OAuthClientLike } from './oauth-client.ts'
import type { Roles } from './roles.ts'
import { scopeAllowsSpaces } from './scope.ts'
import {
  createWebSession,
  deleteAllWebSessions,
  deleteWebSession,
  resolveWebSession,
  SESSION_COOKIE,
} from './web-session.ts'

export type AuthDeps = {
  config: Config
  db: Db
  logger: Logger
  oauth: OAuthClientLike
  identity: IdentityResolver
  roles: Roles
  scope: string
  /** Runs after each login to set up the user's storage. */
  onLogin?: (account: Account) => Promise<void>
}

const loginError = (message: string) => `/login?error=${encodeURIComponent(message)}`

/** Resolve the session cookie to the signed-in user, if any. */
export function sessionMiddleware(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null)
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      const did = await resolveWebSession(deps.db, token, deps.config.sessionTtlDays)
      if (did) {
        const account = await getAccount(deps.db, did)
        if (!account) throw new Error(`A web session names ${did}, which has no account`)
        c.set('user', { did: account.did, account, roles: deps.roles.rolesFor(account.did) })
        await touchActivity(deps.db, account)
      }
    }
    await next()
  }
}

/** Refuse state-changing API requests from other origins. */
export function originCheck(config: Config): MiddlewareHandler<AppEnv> {
  const allowed = new URL(config.publicUrl).origin
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('origin') !== allowed) {
      return c.json({ error: 'Forbidden', message: 'Cross-origin request refused' }, 403)
    }
    await next()
  }
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401)
  await next()
}

export function signedInUser(c: { get(key: 'user'): AuthUser | null }): AuthUser {
  const user = c.get('user')
  if (!user) throw new Error('signedInUser called on a route without requireUser')
  return user
}

/** Client metadata, keys, and the login and callback redirects. */
export function oauthRoutes(deps: AuthDeps) {
  const secure = deps.config.publicUrl.startsWith('https://')
  return new Hono()
    .get('/oauth-client-metadata.json', (c) => c.json(deps.oauth.clientMetadata))
    .get('/oauth/jwks.json', (c) => c.json(deps.oauth.jwks))
    .get('/oauth/login', async (c) => {
      const identifier = c.req.query('identifier')?.trim()
      if (!identifier) return c.redirect(loginError('Enter your handle to sign in.'))
      try {
        const url = await deps.oauth.authorize(identifier, { scope: deps.scope })
        return c.redirect(url.toString())
      } catch (err) {
        deps.logger.warn({ err, identifier }, 'oauth authorize failed')
        return c.redirect(loginError(err instanceof Error ? err.message : 'Sign-in failed.'))
      }
    })
    .get('/oauth/callback', async (c) => {
      try {
        const { session } = await deps.oauth.callback(new URL(c.req.url).searchParams)
        const { scope } = await session.getTokenInfo(false)
        const identity = await deps.identity.resolve(session.did)
        const account = await recordLogin(deps.db, {
          did: session.did,
          handle: identity.handle,
          pdsUrl: identity.pdsUrl,
          spacesAllowed: scopeAllowsSpaces(scope, session.did),
        })
        if (account.storageMode === 'local')
          deps.logger.info({ did: account.did, scope }, 'signed in with local storage')
        if (deps.onLogin) {
          await deps
            .onLogin(account)
            .catch((err) => deps.logger.error({ err, did: account.did }, 'login setup failed'))
        }
        const token = await createWebSession(deps.db, account.did, deps.config.sessionTtlDays)
        setCookie(c, SESSION_COOKIE, token, {
          httpOnly: true,
          sameSite: 'Lax',
          path: '/',
          secure,
          maxAge: deps.config.sessionTtlDays * 86_400,
        })
        return c.redirect('/')
      } catch (err) {
        deps.logger.warn({ err }, 'oauth callback failed')
        return c.redirect(loginError(err instanceof Error ? err.message : 'Sign-in failed.'))
      }
    })
}

/** The signed-in user's details, and logout. */
export function authApiRoutes(deps: AuthDeps) {
  return new Hono<AppEnv>()
    .get('/me', requireUser, (c) => {
      const { did, account, roles } = signedInUser(c)
      return c.json({
        did,
        handle: account.handle,
        storageMode: account.storageMode,
        backgroundSync: account.backgroundSync,
        roles,
      })
    })
    .post('/logout', async (c) => {
      const token = getCookie(c, SESSION_COOKIE)
      const user = c.get('user')
      if (token) await deleteWebSession(deps.db, token)
      if (user && c.req.query('everywhere') === '1') {
        await deleteAllWebSessions(deps.db, user.did)
        try {
          await deps.oauth.revoke(user.did)
        } catch (err) {
          deps.logger.warn({ err, did: user.did }, 'oauth revoke failed')
        }
      }
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
      return c.json({ ok: true })
    })
}
