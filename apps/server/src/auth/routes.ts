import { randomBytes } from 'node:crypto'
import { DidError, OAuthResolverError } from '@atproto/oauth-client-node'
import type { Context } from 'hono'
import { Hono, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Config } from '../config.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv, AuthUser } from '../env.ts'
import type { Logger } from '../logger.ts'
import { safeErrorMessage } from '../safe-error.ts'
import {
  type Account,
  getAccount,
  recordLogin,
  SpacesLostError,
  touchActivity,
} from './accounts.ts'
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

/** What to tell the user when sign-in can't start, in their terms when the account can't be found. */
function authorizeFailure(err: unknown): string {
  if (!(err instanceof OAuthResolverError)) return safeErrorMessage(err)
  if (err.cause instanceof Error && err.cause.name === 'IdentityResolverError')
    return "We couldn't find an account for that handle. Check the spelling, or sign in with your DID instead."
  if (err.cause instanceof DidError) return "We couldn't find an account for that DID."
  return safeErrorMessage(err)
}

/** Ties an OAuth callback to the browser that started the sign-in. */
const LOGIN_COOKIE = 'scn_login'
/** Where to send the user after signing in. */
const NEXT_COOKIE = 'scn_next'

/** Is this a path on this site, and not a link to another one? */
const isLocalPath = (path: string) => /^\/(?![/\\])/.test(path)

class LoginMismatch extends Error {
  constructor() {
    super('This sign-in was started in a different browser. Sign in again here.')
    this.name = 'LoginMismatch'
  }
}

function setSessionCookie(c: Context, token: string, config: Config) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: config.publicUrl.startsWith('https://'),
    maxAge: config.sessionTtlDays * 86_400,
  })
}

/** Resolve the session cookie to the signed-in user, if any. */
export function sessionMiddleware(deps: AuthDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null)
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      const session = await resolveWebSession(deps.db, token, deps.config.sessionTtlDays)
      if (session) {
        const account = await getAccount(deps.db, session.did)
        if (!account) throw new Error(`A web session names ${session.did}, which has no account`)
        if (session.renewed) setSessionCookie(c, token, deps.config)
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
        const state = randomBytes(16).toString('base64url')
        const url = await deps.oauth.authorize(identifier, { scope: deps.scope, state })
        const cookie = {
          httpOnly: true,
          sameSite: 'Lax',
          path: '/oauth',
          secure,
          maxAge: 600,
        } as const
        setCookie(c, LOGIN_COOKIE, state, cookie)
        const next = c.req.query('next')
        if (next && isLocalPath(next)) setCookie(c, NEXT_COOKIE, next, cookie)
        return c.redirect(url.toString())
      } catch (err) {
        deps.logger.warn({ err, identifier }, 'oauth authorize failed')
        return c.redirect(loginError(authorizeFailure(err)))
      }
    })
    .get('/oauth/callback', async (c) => {
      const expected = getCookie(c, LOGIN_COOKIE)
      const next = getCookie(c, NEXT_COOKIE)
      deleteCookie(c, LOGIN_COOKIE, { path: '/oauth' })
      deleteCookie(c, NEXT_COOKIE, { path: '/oauth' })
      let did: string | undefined
      try {
        const { session, state } = await deps.oauth.callback(new URL(c.req.url).searchParams)
        did = session.did
        if (!expected || state !== expected) throw new LoginMismatch()
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
        setSessionCookie(c, token, deps.config)
        return c.redirect(next && isLocalPath(next) ? next : '/')
      } catch (err) {
        deps.logger.warn({ err, did }, 'oauth callback failed')
        // Revoke the tokens the OAuth client already stored for a sign-in that can't be used.
        if (did && (err instanceof SpacesLostError || err instanceof LoginMismatch))
          await deps.oauth
            .revoke(did)
            .catch((revokeErr: unknown) =>
              deps.logger.warn({ err: revokeErr, did }, 'oauth revoke failed'),
            )
        return c.redirect(loginError(safeErrorMessage(err)))
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
