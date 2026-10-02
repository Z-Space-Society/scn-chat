import { isIP } from 'node:net'
import {
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
  type OAuthSession,
  requestLocalLock,
} from '@atproto/oauth-client-node'
import type { Config } from '../config.ts'
import type { Db } from '../db/index.ts'

/** OAuth client methods we call. Tests pass in a fake oauth client that implements them. */
export interface OAuthClientLike {
  readonly clientMetadata: object
  readonly jwks: object
  authorize(input: string, options: { scope: string; state: string }): Promise<URL>
  callback(params: URLSearchParams): Promise<{ session: OAuthSession; state: string | null }>
  restore(did: string): Promise<OAuthSession>
  revoke(did: string): Promise<void>
}

export function isLoopbackUrl(url: string): boolean {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '')
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    (isIP(hostname) === 4 && hostname.startsWith('127.'))
  )
}

function dbStore<T>(db: Db, table: 'oauth_state' | 'oauth_session') {
  return {
    async get(key: string): Promise<T | undefined> {
      const row = await db
        .selectFrom(table)
        .select('value')
        .where('key', '=', key)
        .executeTakeFirst()
      return row ? (JSON.parse(row.value) as T) : undefined
    },
    async set(key: string, value: T): Promise<void> {
      const row = { value: JSON.stringify(value), updated_at: new Date().toISOString() }
      await db
        .insertInto(table)
        .values({ key, ...row })
        .onConflict((oc) => oc.column('key').doUpdateSet(row))
        .execute()
    },
    async del(key: string): Promise<void> {
      await db.deleteFrom(table).where('key', '=', key).execute()
    },
  }
}

/** Create a confidential client in production, or a loopback public client in development. */
export async function createOAuthClient(
  config: Config,
  db: Db,
  scope: string,
  appName: string,
): Promise<NodeOAuthClient> {
  const redirectUri = `${config.publicUrl}/oauth/callback` as const
  const loopback = isLoopbackUrl(config.publicUrl)
  const keyset = loopback
    ? undefined
    : await Promise.all(
        config.oauthPrivateKeys.map((jwk) => JoseKey.fromImportable(JSON.stringify(jwk), jwk.kid)),
      )
  const clientMetadata = loopback
    ? buildAtprotoLoopbackClientMetadata({ redirect_uris: [redirectUri], scope })
    : {
        client_id: `${config.publicUrl}/oauth-client-metadata.json`,
        client_name: appName,
        client_uri: config.publicUrl,
        redirect_uris: [redirectUri] as [string, ...string[]],
        scope,
        grant_types: ['authorization_code', 'refresh_token'] as [
          'authorization_code',
          'refresh_token',
        ],
        response_types: ['code'] as ['code'],
        application_type: 'web' as const,
        token_endpoint_auth_method: 'private_key_jwt' as const,
        token_endpoint_auth_signing_alg: 'ES256',
        jwks_uri: `${config.publicUrl}/oauth/jwks.json`,
        dpop_bound_access_tokens: true,
      }
  return new NodeOAuthClient({
    clientMetadata,
    keyset,
    allowHttp: loopback,
    plcDirectoryUrl: config.plcUrl,
    requestLock: requestLocalLock,
    stateStore: dbStore<NodeSavedState>(db, 'oauth_state'),
    sessionStore: dbStore<NodeSavedSession>(db, 'oauth_session'),
  })
}
