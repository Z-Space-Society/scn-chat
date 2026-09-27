import { nsid } from '@scn-chat/lexicons'
import { Hono } from 'hono'
import { z } from 'zod'
import { getAccount } from '../auth/accounts.ts'
import { jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import { InvalidSpaceUri, parseSpaceUri } from '../storage/records.ts'
import type { SyncEngine } from './engine.ts'
import type { SyncEventBus } from './events.ts'
import { appDid, didDocument, serviceId } from './identity.ts'
import { ServiceAuthError, verifyServiceAuth } from './service-auth.ts'

export type SyncRoutesDeps = {
  db: Db
  engine: SyncEngine
  events: SyncEventBus
  publicUrl: string
  resolveSigningKey: (did: string, forceRefresh: boolean) => Promise<string>
  logger: Logger
}

const authorityOf = (space: string) => parseSpaceUri(space)

const notification = z.object({ space: z.string() })
const syncRequest = z.object({ conversation: z.string().optional() })

/** The app's did:web document and the XRPC endpoints PDSes and clients call. */
export function syncRoutes(deps: SyncRoutesDeps) {
  const background = (work: Promise<void>, context: object) =>
    work.catch((err) => deps.logger.warn({ err, ...context }, 'background sync failed'))

  /** Check that a space notification came from its space authority, returning the refusal if not. */
  const authorize = async (
    authorization: string | undefined,
    method: string,
    authority: string,
  ) => {
    try {
      const issuer = await verifyServiceAuth(
        authorization,
        serviceId(deps.publicUrl),
        `com.atproto.space.${method}`,
        deps.resolveSigningKey,
      )
      if (issuer !== authority) throw new ServiceAuthError('Issuer is not the space authority')
      return null
    } catch (err) {
      if (!(err instanceof ServiceAuthError)) throw err
      deps.logger.warn({ err, method }, 'rejected a space notification')
      return { error: 'AuthenticationRequired', message: err.message }
    }
  }

  return new Hono()
    .get('/.well-known/did.json', (c) => c.json(didDocument(deps.publicUrl)))
    .post('/xrpc/com.atproto.space.notifyWrite', async (c) => {
      const { space } = await jsonBody(c, notification)
      const { did, type, skey } = authorityOf(space)
      const refusal = await authorize(c.req.header('authorization'), 'notifyWrite', did)
      if (refusal) return c.json(refusal, 401)
      if (type === nsid.settings) background(deps.engine.syncIndex(did), { did })
      else if (type === nsid.conversation)
        background(deps.engine.syncConversation(did, skey), { did, skey })
      return c.body(null, 200)
    })
    .post('/xrpc/com.atproto.space.notifySpaceDeleted', async (c) => {
      const { space } = await jsonBody(c, notification)
      const { did, type, skey } = authorityOf(space)
      const refusal = await authorize(c.req.header('authorization'), 'notifySpaceDeleted', did)
      if (refusal) return c.json(refusal, 401)
      await deps.db.deleteFrom('sync_state').where('space_uri', '=', space).execute()
      if (type === nsid.conversation) deps.events.emit('conversation:deleted', { did, skey })
      return c.body(null, 200)
    })
    .post(`/xrpc/${nsid.requestSync}`, async (c) => {
      let issuer: string
      try {
        issuer = await verifyServiceAuth(
          c.req.header('authorization'),
          appDid(deps.publicUrl),
          nsid.requestSync,
          deps.resolveSigningKey,
        )
      } catch (err) {
        return c.json({ error: 'AuthenticationRequired', message: (err as Error).message }, 401)
      }
      const account = await getAccount(deps.db, issuer)
      if (account?.storageMode !== 'space') {
        return c.json(
          {
            error: 'AuthenticationRequired',
            message: 'Caller is not a spaces account on this app',
          },
          401,
        )
      }
      const body = await jsonBody(c, syncRequest)
      if (!body.conversation) {
        await deps.engine.syncIndex(issuer)
        return c.json({})
      }
      let target: ReturnType<typeof authorityOf>
      try {
        target = authorityOf(body.conversation)
      } catch (err) {
        if (!(err instanceof InvalidSpaceUri)) throw err
        return c.json({ error: 'UnknownConversation', message: 'Not a conversation URI' }, 400)
      }
      if (target.did !== issuer || target.type !== nsid.conversation) {
        return c.json(
          { error: 'UnknownConversation', message: 'Conversation does not belong to the caller' },
          400,
        )
      }
      await deps.engine.syncConversation(issuer, target.skey)
      return c.json({})
    })
}
