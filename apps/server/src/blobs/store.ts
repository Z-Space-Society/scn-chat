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
import type { Account } from '../auth/accounts.ts'
import type { PdsClientFactory } from '../auth/pds.ts'
import type { Db } from '../db/index.ts'
import { type JsonRecord, toJson } from '../storage/records.ts'

// Plain strings don't satisfy the generated methods' branded string types.
type Loose = any

export type StoredBlob = { bytes: Uint8Array; mimeType: string }

export class BlobNotFound extends Error {
  constructor(cid: string) {
    super(`Blob not found: ${cid}`)
    this.name = 'BlobNotFound'
  }
}

export interface BlobStore {
  /** Store bytes for a user and return the atproto blob reference, in JSON form. */
  put(account: Account, bytes: Uint8Array, mimeType: string): Promise<JsonRecord>
  /** Read a blob referenced from one of the user's conversations. */
  get(account: Account, conversationUri: string, cid: string): Promise<StoredBlob>
}

/** Blobs on the user's PDS, uploaded normally and read through the space they belong to. */
export class SpaceBlobStore implements BlobStore {
  private readonly getClient: PdsClientFactory

  constructor(getClient: PdsClientFactory) {
    this.getClient = getClient
  }

  async put(account: Account, bytes: Uint8Array, mimeType: string): Promise<JsonRecord> {
    const client: Loose = await this.getClient(account.did)
    const { blob } = await client.call(atproto.repo.uploadBlob, bytes, { encoding: mimeType })
    return toJson(blob)
  }

  async get(account: Account, conversationUri: string, cid: string): Promise<StoredBlob> {
    const client: Loose = await this.getClient(account.did)
    try {
      const response = await client.xrpc(atproto.space.getBlob, {
        params: { space: conversationUri, repo: account.did, cid },
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

/** Blobs for fallback users, one directory per owner, with the CID a PDS would compute. */
export class LocalBlobStore implements BlobStore {
  private readonly root: string
  private readonly db: Db

  constructor(dataDir: string, db: Db) {
    this.root = resolve(dataDir, 'blobs')
    this.db = db
  }

  private dir(did: string): string {
    return join(this.root, encodeURIComponent(did))
  }

  async put(account: Account, bytes: Uint8Array, mimeType: string): Promise<JsonRecord> {
    const cid = (await cidForRawBytes(bytes)).toString()
    const dir = this.dir(account.did)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, cid), bytes)
    writeFileSync(join(dir, `${cid}.json`), JSON.stringify({ mimeType, size: bytes.length }))
    return { $type: 'blob', ref: { $link: cid }, mimeType, size: bytes.length }
  }

  async get(account: Account, _conversationUri: string, cid: string): Promise<StoredBlob> {
    if (!/^[a-z0-9]+$/.test(cid)) throw new BlobNotFound(cid)
    const path = join(this.dir(account.did), cid)
    if (!existsSync(path)) throw new BlobNotFound(cid)
    const meta = JSON.parse(readFileSync(`${path}.json`, 'utf8')) as { mimeType: string }
    return { bytes: new Uint8Array(readFileSync(path)), mimeType: meta.mimeType }
  }

  /** Delete blobs older than a day that no record references. */
  async sweep(now = Date.now()): Promise<number> {
    if (!existsSync(this.root)) return 0
    let removed = 0
    for (const owner of readdirSync(this.root)) {
      const dir = join(this.root, owner)
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.json')) continue
        const path = join(dir, name)
        if (now - statSync(path).mtimeMs < 86_400_000) continue
        const referenced = await this.db
          .selectFrom('local_record')
          .select('rkey')
          .where('value_json', 'like', `%${name}%`)
          .executeTakeFirst()
        if (referenced) continue
        rmSync(path, { force: true })
        rmSync(`${path}.json`, { force: true })
        removed++
      }
    }
    return removed
  }
}

/** The store for an account's storage mode. */
export function createBlobStores(deps: {
  getPdsClient: PdsClientFactory
  dataDir: string
  db: Db
}) {
  const space = new SpaceBlobStore(deps.getPdsClient)
  const local = new LocalBlobStore(deps.dataDir, deps.db)
  return {
    space,
    local,
    forAccount: (account: Account): BlobStore => (account.storageMode === 'space' ? space : local),
  }
}
