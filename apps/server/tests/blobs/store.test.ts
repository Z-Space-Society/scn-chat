import { createHash } from 'node:crypto'
import { mkdtempSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256RawToCid } from '@atproto/common'
import { describe, expect, it } from 'vitest'
import { BlobNotFound, LocalBlobStore, SpaceBlobStore } from '../../src/blobs/store.ts'
import { spacesHarness, userMessage } from '../helpers/spaces.ts'

describe('LocalBlobStore', () => {
  const setup = async () => {
    const h = await spacesHarness({ storageMode: 'local' })
    const dir = mkdtempSync(join(tmpdir(), 'scn-blobs-'))
    return { ...h, store: new LocalBlobStore(dir, h.db), dir }
  }

  it('gives blobs the CID a PDS computes for the same bytes', async () => {
    const { store, account } = await setup()
    const bytes = new TextEncoder().encode('hello blob')
    const ref = await store.put(account, bytes, 'text/plain')
    const expected = sha256RawToCid(createHash('sha256').update(bytes).digest()).toString()
    expect(ref).toEqual({
      $type: 'blob',
      ref: { $link: expected },
      mimeType: 'text/plain',
      size: bytes.length,
    })
  })

  it('reads a stored blob back with its type', async () => {
    const { store, account } = await setup()
    const ref = (await store.put(account, new Uint8Array([1, 2, 3]), 'image/png')) as {
      ref: { $link: string }
    }
    expect(await store.get(account, 'at://x', ref.ref.$link)).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    })
  })

  it('keeps each owner blobs separate', async () => {
    const { store, account } = await setup()
    const ref = (await store.put(account, new Uint8Array([9]), 'image/png')) as {
      ref: { $link: string }
    }
    await expect(
      store.get({ ...account, did: 'did:plc:bob' }, 'at://x', ref.ref.$link),
    ).rejects.toBeInstanceOf(BlobNotFound)
  })

  it('sweeps unreferenced blobs older than a day and keeps referenced ones', async () => {
    const { store, account, chats, dir } = await setup()
    const orphan = (await store.put(account, new Uint8Array([1]), 'image/png')) as {
      ref: { $link: string }
    }
    const kept = (await store.put(account, new Uint8Array([2]), 'image/png')) as {
      ref: { $link: string }
    }
    const { skey } = await chats.createConversation()
    await chats.createMessage(skey, '3mmmmmmmmmmm1', {
      ...userMessage('see image'),
      content: {
        $type: 'network.sharedcomputer.chat.defs#plainContent',
        parts: [{ $type: 'network.sharedcomputer.chat.defs#imagePart', image: kept }],
      },
    } as never)
    const old = (Date.now() - 2 * 86_400_000) / 1000
    for (const cid of [orphan.ref.$link, kept.ref.$link])
      utimesSync(join(dir, 'blobs', encodeURIComponent(account.did), cid), old, old)
    expect(await store.sweep()).toBe(1)
    await expect(store.get(account, 'at://x', orphan.ref.$link)).rejects.toBeInstanceOf(
      BlobNotFound,
    )
    await expect(store.get(account, 'at://x', kept.ref.$link)).resolves.toBeDefined()
  })
})

describe('SpaceBlobStore', () => {
  it('reads a blob back through its conversation, with the type the PDS reports', async () => {
    const h = await spacesHarness()
    const store = new SpaceBlobStore(async (did) => h.pds.client(did) as never)
    const image = await store.put(h.account, new Uint8Array([1, 2, 3]), 'image/png')
    const { skey, uri } = await h.chats.createConversation()
    await h.chats.createMessage(skey, '3mmmmmmmmmmm1', {
      ...userMessage('see image'),
      content: {
        $type: 'network.sharedcomputer.chat.defs#plainContent',
        parts: [{ $type: 'network.sharedcomputer.chat.defs#imagePart', image }],
      },
    } as never)
    const cid = (image as { ref: { $link: string } }).ref.$link
    expect(await store.get(h.account, uri, cid)).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
    })
  })
})
