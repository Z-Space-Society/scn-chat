import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { setBackgroundSync } from '../auth/accounts.ts'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'
import type { HookRunner } from '../plugins/hooks.ts'
import { jsonObject } from '../schemas.ts'
import type { SyncEngine } from '../sync/engine.ts'
import type { SyncEventBus, SyncEvents } from '../sync/events.ts'
import type { ResolvedSyncConfig } from '../sync/scheduler.ts'
import type { ChatServices } from './services.ts'

export type StorageRoutesDeps = {
  db: Db
  services: ChatServices
  events: SyncEventBus
  engine?: SyncEngine
  hooks?: HookRunner
  syncConfig: ResolvedSyncConfig
  logger: Logger
}

const OPEN_SYNC_WAIT_MS = 2_000

const newConversation = z.object({
  systemPrompt: z.string().optional(),
  tags: z.array(z.string()).optional(),
})
const conversationPatch = newConversation.extend({ title: z.string().optional() })
const accountSettings = z.object({ backgroundSync: z.boolean().optional() })

/** The chat API used by the web app. Every read goes to the user's record store. */
export function storageRoutes(deps: StorageRoutesDeps) {
  const chatsFor = (c: { get(key: 'user'): ReturnType<typeof signedInUser> | null }) =>
    deps.services.forAccount(signedInUser(c).account)

  /** Sync a spaces conversation before reading it, answering from the PDS after two seconds regardless. */
  const syncBeforeRead = async (did: string, skey: string) => {
    if (!deps.engine) return
    const sync = deps.engine
      .syncConversation(did, skey)
      .catch((err) => deps.logger.warn({ err, did, skey }, 'sync on open failed'))
    await Promise.race([sync, new Promise((resolve) => setTimeout(resolve, OPEN_SYNC_WAIT_MS))])
  }

  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/conversations', async (c) =>
      c.json(await chatsFor(c).listConversations(c.req.query('since'))),
    )
    .post('/conversations', async (c) => {
      const body = await jsonBody(c, newConversation, { optional: true })
      const chats = chatsFor(c)
      const created = await chats.createConversation({
        systemPrompt: body.systemPrompt,
        tags: body.tags,
      })
      await deps.hooks?.action(
        'conversation:created',
        { user: chats.did, conversation: created.uri },
        deps.logger,
      )
      return c.json(created, 201)
    })
    .get('/conversations/keys', async (c) => c.json({ keys: await chatsFor(c).listKeys() }))
    .get('/conversations/:skey', async (c) => {
      const user = signedInUser(c)
      const skey = c.req.param('skey')
      if (user.account.storageMode === 'space') await syncBeforeRead(user.did, skey)
      const result = await chatsFor(c).getConversation(skey, c.req.query('since'))
      if (result.full && !result.info) return c.json({ error: 'NotFound' }, 404)
      return c.json(result)
    })
    .get('/conversations/:skey/keys', async (c) =>
      c.json({ keys: await chatsFor(c).listKeys(c.req.param('skey')) }),
    )
    .patch('/conversations/:skey', async (c) => {
      const skey = c.req.param('skey')
      const body = await jsonBody(c, conversationPatch)
      const chats = chatsFor(c)
      const patch: Record<string, unknown> = {}
      if (body.title !== undefined) Object.assign(patch, { title: body.title, titleSource: 'user' })
      if (body.systemPrompt !== undefined) patch.systemPrompt = body.systemPrompt
      if (Object.keys(patch).length > 0 && !(await chats.updateInfo(skey, patch))) {
        return c.json({ error: 'NotFound' }, 404)
      }
      if (body.tags !== undefined) await chats.setTags(skey, body.tags)
      return c.json({ ok: true })
    })
    .delete('/conversations/:skey', async (c) => {
      const chats = chatsFor(c)
      const skey = c.req.param('skey')
      await chats.deleteConversation(skey)
      await deps.hooks?.action(
        'conversation:deleted',
        { user: chats.did, conversation: chats.conversationUri(skey) },
        deps.logger,
      )
      return c.json({ ok: true })
    })
    .post('/conversations/:skey/sync', async (c) => {
      const user = signedInUser(c)
      if (user.account.storageMode === 'space' && deps.engine)
        await deps.engine.syncConversation(user.did, c.req.param('skey'))
      return c.json({ ok: true })
    })
    .get('/preferences', async (c) => c.json({ preferences: await chatsFor(c).getPreferences() }))
    .put('/preferences', async (c) => {
      await chatsFor(c).putPreferences(await jsonBody(c, jsonObject))
      return c.json({ ok: true })
    })
    .get('/account', (c) => {
      const { account } = signedInUser(c)
      return c.json({
        backgroundSync: account.backgroundSync,
        allowUserOptOut: deps.syncConfig.allowUserOptOut,
      })
    })
    .put('/account', async (c) => {
      const body = await jsonBody(c, accountSettings)
      if (body.backgroundSync !== undefined) {
        if (!deps.syncConfig.allowUserOptOut) {
          return c.json(
            { error: 'Forbidden', message: 'This app does not allow turning off background sync' },
            403,
          )
        }
        await setBackgroundSync(deps.db, signedInUser(c).did, body.backgroundSync)
      }
      return c.json({ ok: true })
    })
    .get('/events', (c) => {
      const { did } = signedInUser(c)
      return streamSSE(c, async (stream) => {
        let writes = Promise.resolve()
        const send = (event: string, data: object) => {
          writes = writes.then(() => stream.writeSSE({ event, data: JSON.stringify(data) }))
        }
        const onConversation = (e: SyncEvents['conversation:changed'][0]) =>
          e.did === did && send('conversation-changed', { skey: e.skey })
        const onDeleted = (e: SyncEvents['conversation:deleted'][0]) =>
          e.did === did && send('conversation-deleted', { skey: e.skey })
        const onIndex = (e: SyncEvents['index:changed'][0]) =>
          e.did === did && send('index-changed', {})
        deps.events.on('conversation:changed', onConversation)
        deps.events.on('conversation:deleted', onDeleted)
        deps.events.on('index:changed', onIndex)
        const heartbeat = setInterval(() => send('ping', {}), 25_000)
        await new Promise<void>((resolve) => stream.onAbort(resolve))
        clearInterval(heartbeat)
        deps.events.off('conversation:changed', onConversation)
        deps.events.off('conversation:deleted', onDeleted)
        deps.events.off('index:changed', onIndex)
      })
    })
}
