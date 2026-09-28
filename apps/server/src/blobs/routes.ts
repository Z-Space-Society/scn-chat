import { nsid } from '@scn-chat/lexicons'
import { Hono } from 'hono'
import { requireUser, signedInUser } from '../auth/routes.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'
import type { IngesterRegistry } from '../plugins/registry.ts'
import type { ChatServices } from '../storage/services.ts'
import { BlobNotFound, type BlobStore } from './store.ts'

export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
export const MAX_IMAGE_BYTES = 20_000_000
export const MAX_FILE_BYTES = 50_000_000
export const MAX_EXTRACTED_BYTES = 20_000_000
const MAX_NAME_LENGTH = 1024

/** Read a request body, bail when we hit `limit`. */
async function readLimited(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = body?.getReader()
  for (;;) {
    const next = await reader?.read()
    if (!next || next.done) break
    size += next.value.length
    if (size > limit) {
      await reader?.cancel()
      return null
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

export type BlobRoutesDeps = {
  blobsFor: (account: Parameters<ChatServices['forAccount']>[0]) => BlobStore
  services: ChatServices
  ingesters: IngesterRegistry
  logger: Logger
}

/** Uploading attachments, and serving a conversation's blobs to its owner. */
export function blobRoutes(deps: BlobRoutesDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/attachments/types', (c) =>
      c.json({ images: [...IMAGE_TYPES], files: deps.ingesters.accepted() }),
    )
    .post('/attachments', async (c) => {
      const { account } = signedInUser(c)
      const mimeType =
        (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
      let name: string
      try {
        name = decodeURIComponent(c.req.header('x-filename') ?? 'attachment')
      } catch {
        return c.json({ error: 'InvalidRequest', message: 'x-filename is not URI-encoded' }, 400)
      }
      if (name.length > MAX_NAME_LENGTH)
        return c.json({ error: 'InvalidRequest', message: 'Filename is too long' }, 400)
      const image = IMAGE_TYPES.has(mimeType)
      const ingester = image ? undefined : deps.ingesters.match(mimeType)
      if (!image && !ingester)
        return c.json(
          { error: 'UnsupportedMediaType', message: `Files of type ${mimeType} are not supported` },
          415,
        )
      const declared = Number(c.req.header('content-length') ?? 0)
      const limit = image ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
      if (declared > limit)
        return c.json({ error: 'PayloadTooLarge', message: `Limit is ${limit} bytes` }, 413)
      const bytes = await readLimited(c.req.raw.body, limit)
      if (!bytes)
        return c.json({ error: 'PayloadTooLarge', message: `Limit is ${limit} bytes` }, 413)
      const store = deps.blobsFor(account)
      if (image) {
        const blob = await store.put(account, bytes, mimeType)
        return c.json({ part: { $type: `${nsid.defs}#imagePart`, image: blob } }, 201)
      }
      let text: string
      try {
        text = (await (ingester as NonNullable<typeof ingester>).ingest({ bytes, mimeType, name }))
          .text
      } catch (err) {
        deps.logger.warn({ err, mimeType, name }, 'file ingestion failed')
        return c.json(
          {
            error: 'IngestFailed',
            message: err instanceof Error ? err.message : 'Could not read the file',
          },
          422,
        )
      }
      const extractedBytes = new TextEncoder().encode(text)
      if (extractedBytes.length > MAX_EXTRACTED_BYTES)
        return c.json(
          { error: 'PayloadTooLarge', message: 'This file has more text than a message can hold' },
          413,
        )
      const file = await store.put(account, bytes, mimeType)
      const extracted = await store.put(account, extractedBytes, 'text/plain')
      return c.json(
        {
          part: {
            $type: `${nsid.defs}#filePart`,
            file,
            name,
            extracted: {
              text: extracted,
              method: (ingester as NonNullable<typeof ingester>).method,
            },
          },
        },
        201,
      )
    })
    .get('/conversations/:skey/blobs/:cid', async (c) => {
      const { account } = signedInUser(c)
      const chats = deps.services.forAccount(account)
      try {
        const blob = await deps
          .blobsFor(account)
          .get(account, chats.conversationUri(c.req.param('skey')), c.req.param('cid'))
        const mimeType =
          c.req.query('type') && IMAGE_TYPES.has(String(c.req.query('type')))
            ? String(c.req.query('type'))
            : blob.mimeType
        c.header('content-type', mimeType)
        c.header('x-content-type-options', 'nosniff')
        if (!IMAGE_TYPES.has(mimeType)) c.header('content-disposition', 'attachment')
        return c.body(blob.bytes as unknown as ArrayBuffer)
      } catch (err) {
        if (err instanceof BlobNotFound) return c.json({ error: 'NotFound' }, 404)
        throw err
      }
    })
}

/** Blob access for the turn runner, through each account's store. */
export function turnBlobs(blobsFor: BlobRoutesDeps['blobsFor'], services: ChatServices) {
  return {
    reader:
      (account: Parameters<BlobRoutesDeps['blobsFor']>[0], skey: string) => async (cid: string) =>
        blobsFor(account).get(account, services.forAccount(account).conversationUri(skey), cid),
    put: (
      account: Parameters<BlobRoutesDeps['blobsFor']>[0],
      bytes: Uint8Array,
      mimeType: string,
    ) => blobsFor(account).put(account, bytes, mimeType),
  }
}
