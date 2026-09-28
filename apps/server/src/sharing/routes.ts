import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { IMAGE_TYPES } from '../blobs/routes.ts'
import { jsonBody } from '../body.ts'
import type { AppEnv } from '../env.ts'
import { SharedNotFound, ShareInputError, type SharingService } from './service.ts'

const shareSettings = z.object({
  mode: z.enum(['private', 'people', 'public']),
  members: z.array(z.string().min(1)).default([]),
})
const NEEDS_SPACES = 'Sharing needs a PDS that supports atproto spaces.'

/** Share settings for the owner, and read-only shared views for viewers. */
export function sharingRoutes(sharing: SharingService) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/conversations/:skey/sharing', async (c) => {
      const { account } = signedInUser(c)
      if (account.storageMode !== 'space')
        return c.json({ error: 'Forbidden', message: NEEDS_SPACES }, 403)
      return c.json(await sharing.getSettings(account, c.req.param('skey')))
    })
    .put('/conversations/:skey/sharing', async (c) => {
      const { account } = signedInUser(c)
      if (account.storageMode !== 'space')
        return c.json({ error: 'Forbidden', message: NEEDS_SPACES }, 403)
      const body = await jsonBody(c, shareSettings)
      try {
        await sharing.setSettings(account, c.req.param('skey'), body.mode, body.members)
      } catch (err) {
        if (err instanceof ShareInputError)
          return c.json({ error: 'InvalidRequest', message: err.message }, 400)
        throw err
      }
      return c.json({ ok: true })
    })
    .get('/shared/:ownerDid/:skey', async (c) => {
      const { account } = signedInUser(c)
      if (account.storageMode !== 'space') {
        return c.json(
          {
            error: 'Forbidden',
            message: 'Viewing shared chats needs a PDS that supports atproto spaces.',
          },
          403,
        )
      }
      try {
        return c.json(await sharing.view(account, c.req.param('ownerDid'), c.req.param('skey')))
      } catch (err) {
        if (err instanceof SharedNotFound) return c.json({ error: 'NotFound' }, 404)
        throw err
      }
    })
    .get('/shared/:ownerDid/:skey/blobs/:cid', async (c) => {
      const { account } = signedInUser(c)
      if (account.storageMode !== 'space')
        return c.json({ error: 'Forbidden', message: NEEDS_SPACES }, 403)
      try {
        const bytes = await sharing.blob(
          account,
          c.req.param('ownerDid'),
          c.req.param('skey'),
          c.req.param('cid'),
        )
        const type = c.req.query('type')
        const mimeType = type && IMAGE_TYPES.has(type) ? type : 'application/octet-stream'
        c.header('content-type', mimeType)
        c.header('x-content-type-options', 'nosniff')
        if (!IMAGE_TYPES.has(mimeType)) c.header('content-disposition', 'attachment')
        return c.body(bytes as unknown as ArrayBuffer)
      } catch (err) {
        if (err instanceof SharedNotFound) return c.json({ error: 'NotFound' }, 404)
        throw err
      }
    })
}
