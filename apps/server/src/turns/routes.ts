import { nsid } from '@scn-chat/lexicons'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { AppEnv } from '../env.ts'
import { modelRef } from '../schemas.ts'
import type { JsonRecord } from '../storage/records.ts'
import { newTid } from '../storage/records.ts'
import type { ChatServices } from '../storage/services.ts'
import type { TurnRunner } from './runner.ts'
import type { HubEvent, StreamHub } from './stream-hub.ts'

export type TurnRoutesDeps = { services: ChatServices; runner: TurnRunner; hub: StreamHub }

const USER_PARTS = new Set(['textPart', 'imagePart', 'filePart'])

const sendBody = z.object({
  parent: z.string().min(1).optional(),
  parts: z.array(z.looseObject({ $type: z.string() })).min(1),
  generation: z
    .object({
      model: modelRef.optional(),
      effort: z.string().optional(),
      tools: z.array(z.string()).optional(),
    })
    .strict()
    .optional(),
})

const regenerateBody = z.object({ model: modelRef.optional(), effort: z.string().optional() })

/** Sending messages, regenerating, cancelling, and streaming replies. */
export function turnRoutes(deps: TurnRoutesDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .post('/conversations/:skey/messages', async (c) => {
      const user = signedInUser(c)
      const skey = c.req.param('skey')
      const body = await jsonBody(c, sendBody)
      const parts = body.parts
      if (parts.some((part) => !USER_PARTS.has(part.$type.split('#')[1] as string))) {
        return c.json(
          { error: 'InvalidRequest', message: 'A message needs text or attachment parts only' },
          400,
        )
      }
      const chats = deps.services.forAccount(user.account)
      const rkey = newTid()
      const record: JsonRecord = {
        $type: nsid.message,
        role: 'user',
        content: { $type: `${nsid.defs}#plainContent`, parts },
        createdAt: new Date().toISOString(),
      }
      if (body.parent) record.parent = body.parent
      if (body.generation) record.generation = { ...body.generation, attempt: 0 }
      await chats.createMessage(skey, rkey, record)
      const started = body.generation ? await deps.runner.start(user.did, skey, rkey) : undefined
      return c.json(
        { rkey, replyRkey: started?.replyRkey ?? null, status: started?.status ?? null },
        201,
      )
    })
    .post('/conversations/:skey/messages/:rkey/regenerate', async (c) => {
      const user = signedInUser(c)
      const skey = c.req.param('skey')
      const rkey = c.req.param('rkey')
      const body = await jsonBody(c, regenerateBody, { optional: true })
      const chats = deps.services.forAccount(user.account)
      const existing = await chats.store.getRecord(chats.conversationUri(skey), nsid.message, rkey)
      if (existing?.value.role !== 'user') return c.json({ error: 'NotFound' }, 404)
      const previous = (existing.value.generation ?? {}) as { attempt?: number } & JsonRecord
      const generation: JsonRecord = { ...previous, attempt: (previous.attempt ?? 0) + 1 }
      if (body.model) generation.model = body.model
      if (body.effort) generation.effort = body.effort
      await chats.putMessage(skey, rkey, { ...existing.value, generation })
      const started = await deps.runner.start(user.did, skey, rkey)
      return c.json({ replyRkey: started.replyRkey ?? null, status: started.status })
    })
    .post('/conversations/:skey/messages/:rkey/cancel', async (c) => {
      const user = signedInUser(c)
      const cancelled = await deps.runner.cancel(user.did, c.req.param('skey'), c.req.param('rkey'))
      return c.json({ cancelled })
    })
    .get('/conversations/:skey/messages/:rkey/stream', (c) => {
      const user = signedInUser(c)
      const key = deps.runner.streamKey(user.did, c.req.param('skey'), c.req.param('rkey'))
      return streamSSE(c, async (stream) => {
        if (!deps.hub.has(key)) {
          await stream.writeSSE({ event: 'status', data: JSON.stringify({ status: 'unknown' }) })
          return
        }
        let writes = Promise.resolve()
        await new Promise<void>((resolve) => {
          const send = (event: HubEvent) => {
            const { type, ...data } = event
            writes = writes.then(() => stream.writeSSE({ event: type, data: JSON.stringify(data) }))
            if (type === 'status') resolve()
          }
          const unsubscribe = deps.hub.subscribe(key, send)
          stream.onAbort(() => {
            unsubscribe()
            resolve()
          })
        })
        await writes
      })
    })
}
