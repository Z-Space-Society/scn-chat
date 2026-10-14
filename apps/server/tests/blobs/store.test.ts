import { createHash } from 'node:crypto'
import { utimesSync } from 'node:fs'
import { join } from 'node:path'
import { sha256RawToCid } from '@atproto/common'
import { describe, expect, it } from 'vitest'
import { BlobNotFound, LocalBlobStore, sweepLocalBlobs } from '../../src/blobs/store.ts'
import { spacesHarness, userMessage } from '../helpers/spaces.ts'

/** A message whose content shows an image, so the image's blob is referenced. */
const showing = (image: unknown) =>
  ({
    ...userMessage('see image'),
    content: {
      $type: 'network.sharedcomputer.chat.defs#plainContent',
      parts: [{ $type: 'network.sharedcomputer.chat.defs#imagePart', image }],
    },
  }) as never

const cidOf = (ref: unknown) => (ref as { ref: { $link: string } }).ref.$link

describe('blobs in local storage', () => {
  it('gives blobs the CID a PDS computes for the same bytes', async () => {
    const { chats } = await spacesHarness({ storageMode: 'local' })
    const bytes = new TextEncoder().encode('hello blob')
    const ref = await chats.putBlob(bytes, 'text/plain')
    const expected = sha256RawToCid(createHash('sha256').update(bytes).digest()).toString()
    expect(ref).toEqual({
      $type: 'blob',
      ref: { $link: expected },
      mimeType: 'text/plain',
      size: bytes.length,
    })
  })

  it("keeps each owner's blobs separate", async () => {
    const { chats, dataDir } = await spacesHarness({ storageMode: 'local' })
    const ref = await chats.putBlob(new Uint8Array([9]), 'image/png')
    const bob = new LocalBlobStore('did:plc:bob', dataDir)
    await expect(bob.get('at://x', cidOf(ref))).rejects.toBeInstanceOf(BlobNotFound)
  })

  it('sweeps unreferenced blobs older than a day and keeps referenced ones', async () => {
    const { chats, account, db, dataDir } = await spacesHarness({ storageMode: 'local' })
    const orphan = await chats.putBlob(new Uint8Array([1]), 'image/png')
    const kept = await chats.putBlob(new Uint8Array([2]), 'image/png')
    const { skey } = await chats.createConversation()
    await chats.createMessage(skey, '3mmmmmmmmmmm1', showing(kept))
    const old = (Date.now() - 2 * 86_400_000) / 1000
    for (const ref of [orphan, kept])
      utimesSync(join(dataDir, 'blobs', encodeURIComponent(account.did), cidOf(ref)), old, old)
    expect(await sweepLocalBlobs(dataDir, db)).toBe(1)
    await expect(chats.readBlob(skey, cidOf(orphan))).rejects.toBeInstanceOf(BlobNotFound)
    await expect(chats.readBlob(skey, cidOf(kept))).resolves.toBeDefined()
  })
})

describe('blobs on a spaces PDS', () => {
  it('reads a blob back through its conversation, with the type the PDS reports', async () => {
    const { chats } = await spacesHarness()
    const image = await chats.putBlob(new Uint8Array([1, 2, 3]), 'image/png')
    const { skey } = await chats.createConversation()
    await chats.createMessage(skey, '3mmmmmmmmmmm1', showing(image))
    expect(await chats.readBlob(skey, cidOf(image))).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    })
  })

  it('refuses a blob no record in the conversation references, as the PDS does', async () => {
    const { chats } = await spacesHarness()
    const image = await chats.putBlob(new Uint8Array([4]), 'image/png')
    const { skey } = await chats.createConversation()
    await expect(chats.readBlob(skey, cidOf(image))).rejects.toBeInstanceOf(BlobNotFound)
  })
})
