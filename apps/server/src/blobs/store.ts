import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { cidForRawBytes, LexError } from '@atproto/lex-data'
import { atproto } from '@scn-chat/lexicons'
import type { PdsClientFactory } from '../auth/pds.ts'
import type { Db } from '../db/index.ts'
import type { Loose } from '../loose.ts'
import { localRecordReferences } from '../storage/local-record-store.ts'
import { type JsonRecord, toJson } from '../storage/records.ts'

export type StoredBlob = { bytes: Uint8Array; mimeType: string }

export class BlobNotFound extends Error {
  constructor(cid: string) {
    super(`Blob not found: ${cid}`)
    this.name = 'BlobNotFound'
  }
}

export interface BlobStore {
  /** Store bytes for the account and return the atproto blob reference, in JSON form. */
  put(bytes: Uint8Array, mimeType: string): Promise<JsonRecord>
  /** Read a blob referenced from one of the account's conversations. */
  get(conversationUri: string, cid: string): Promise<StoredBlob>
}

/** Blobs on the user's PDS, uploaded normally and read through the space they belong to. */
export class SpaceBlobStore implements BlobStore {
  private readonly did: string
  private readonly getClient: PdsClientFactory

  constructor(did: string, getClient: PdsClientFactory) {
    this.did = did
    this.getClient = getClient
  }

  async put(bytes: Uint8Array, mimeType: string): Promise<JsonRecord> {
    const client: Loose = await this.getClient(this.did)
    const { blob } = await client.call(atproto.repo.uploadBlob, bytes, { encoding: mimeType })
    return toJson(blob)
  }

  async get(conversationUri: string, cid: string): Promise<StoredBlob> {
    const client: Loose = await this.getClient(this.did)
    try {
      const response = await client.xrpc(atproto.space.getBlob, {
        params: { space: conversationUri, repo: this.did, cid },
      })
      return { bytes: response.body as Uint8Array, mimeType: response.encoding as string }
    } catch (err) {
      if (
        err instanceof LexError &&
        (err.error === 'BlobNotFound' || err.error === 'RecordNotFound')
      )
        throw new BlobNotFound(cid)
      throw err
    }
  }
}

/** Where fallback users' blobs live, one directory per owner. */
const blobRoot = (dataDir: string) => resolve(dataDir, 'blobs')

/** Blobs for a fallback user, in their own directory, with the CID a PDS would compute. */
export class LocalBlobStore implements BlobStore {
  private readonly dir: string

  constructor(did: string, dataDir: string) {
    this.dir = join(blobRoot(dataDir), encodeURIComponent(did))
  }

  async put(bytes: Uint8Array, mimeType: string): Promise<JsonRecord> {
    const cid = (await cidForRawBytes(bytes)).toString()
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(join(this.dir, cid), bytes)
    writeFileSync(join(this.dir, `${cid}.json`), JSON.stringify({ mimeType, size: bytes.length }))
    return { $type: 'blob', ref: { $link: cid }, mimeType, size: bytes.length }
  }

  async get(_conversationUri: string, cid: string): Promise<StoredBlob> {
    if (!/^[a-z0-9]+$/.test(cid)) throw new BlobNotFound(cid)
    const path = join(this.dir, cid)
    if (!existsSync(path)) throw new BlobNotFound(cid)
    const meta = JSON.parse(readFileSync(`${path}.json`, 'utf8')) as { mimeType: string }
    return { bytes: new Uint8Array(readFileSync(path)), mimeType: meta.mimeType }
  }
}

/** Delete fallback users' blobs older than a day that no record references. */
export async function sweepLocalBlobs(dataDir: string, db: Db, now = Date.now()): Promise<number> {
  const root = blobRoot(dataDir)
  if (!existsSync(root)) return 0
  let removed = 0
  for (const owner of readdirSync(root)) {
    const dir = join(root, owner)
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.json')) continue
      const path = join(dir, name)
      if (now - statSync(path).mtimeMs < 86_400_000) continue
      if (await localRecordReferences(db, name)) continue
      rmSync(path, { force: true })
      rmSync(`${path}.json`, { force: true })
      removed++
    }
  }
  return removed
}
