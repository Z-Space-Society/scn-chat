import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { AppEnv } from '../env.ts'
import { modelRef } from '../schemas.ts'
import type { TurnRunner } from './runner.ts'
import type { HubEvent, StreamHub } from './stream-hub.ts'

export type TurnRoutesDeps = { runner: TurnRunner; hub: StreamHub }

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
      const { rkey, started } = await deps.runner.send(user.account, skey, {
        parts,
        parent: body.parent,
        generation: body.generation,
      })
      return c.json(
        { rkey, replyRkey: started?.replyRkey ?? null, status: started?.status ?? null },
        201,
      )
    })
    .post('/conversations/:skey/messages/:rkey/regenerate', async (c) => {
      const user = signedInUser(c)
      const body = await jsonBody(c, regenerateBody, { optional: true })
      const started = await deps.runner.regenerate(
        user.account,
        c.req.param('skey'),
        c.req.param('rkey'),
        { model: body.model, effort: body.effort },
      )
      if (!started) return c.json({ error: 'NotFound' }, 404)
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
