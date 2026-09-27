import { TID } from '@atproto/common-web'
import { type Keypair, Secp256k1Keypair } from '@atproto/crypto'
import { cidForRawBytes, LexError, parseCid } from '@atproto/lex-data'
import { RepoCommit } from '@atproto/space'
import { atproto } from '@scn-chat/lexicons'
import type { Db } from '../../src/db/index.ts'
import { LocalRecordStore } from '../../src/storage/local-record-store.ts'
import { RecordExists, SpaceExists, SpaceNotFound } from '../../src/storage/record-store.ts'
import { parseSpaceUri, toJson, toLex } from '../../src/storage/records.ts'

type Call = { nsid: string; input: Record<string, unknown> }

// Map the local store's counter revs onto TIDs, keeping their order.
const TID_BASE = 1_700_000_000_000_000
const toTid = (rev: string) => TID.fromTime(TID_BASE + Number(rev), 0).toString()
const fromTid = (tid: string) => String(TID.fromStr(tid).timestamp() - TID_BASE)

type OutputSchema = { safeParse(value: unknown): { success: boolean; reason?: unknown } }

/** Fail the test when the fake answers in a shape the method's lexicon does not allow. */
function assertOutput<T>(method: { $nsid: string }, output: T): T {
  const schema = (method as { main?: { output?: { schema?: OutputSchema } } }).main?.output?.schema
  if (!schema) return output
  const result = schema.safeParse(output)
  if (!result.success)
    throw new Error(`FakePds answered ${method.$nsid} off-lexicon: ${String(result.reason)}`)
  return output
}

/** A fake spaces PDS answering the space XRPC methods with a PDS's semantics and error codes. */
export class FakePds {
  readonly calls: Call[] = []
  private readonly db: Db
  failNext: { nsid: string; error: string } | null = null
  /** Signs commits, as a real PDS signs with the account key. */
  readonly keypair: Keypair
  /** Sign commits over a set that includes a record the repo does not have. */
  tamperCommits = false
  readonly blobs = new Map<string, { bytes: Uint8Array; mimeType: string }>()
  readonly policies = new Map<
    string,
    { readPolicy: string; members: Map<string, { read: boolean; write: boolean }> }
  >()

  private policy(space: string) {
    let policy = this.policies.get(space)
    if (!policy) {
      policy = { readPolicy: 'com.atproto.simplespace.defs#memberListPolicy', members: new Map() }
      this.policies.set(space, policy)
    }
    return policy
  }

  /** Would the space authority issue this viewer a credential? */
  mayRead(space: string, viewer: string): boolean {
    if (parseSpaceUri(space).did === viewer) return true
    const policy = this.policy(space)
    return policy.readPolicy.endsWith('#publicPolicy') || policy.members.get(viewer)?.read === true
  }

  constructor(db: Db, keypair: Keypair) {
    this.db = db
    this.keypair = keypair
  }

  static async create(db: Db): Promise<FakePds> {
    return new FakePds(db, await Secp256k1Keypair.create())
  }

  client(did: string) {
    const store = new LocalRecordStore(did, this.db)
    const call = async (
      method: { $nsid: string },
      input: Record<string, unknown>,
      options?: { encoding?: string },
    ) => {
      this.calls.push({ nsid: method.$nsid, input })
      if (method.$nsid === atproto.repo.uploadBlob.$nsid) {
        const bytes = input as unknown as Uint8Array
        const cid = await cidForRawBytes(bytes)
        this.blobs.set(cid.toString(), {
          bytes,
          mimeType: options?.encoding ?? 'application/octet-stream',
        })
        return {
          blob: { $type: 'blob', ref: cid, mimeType: options?.encoding, size: bytes.length },
        }
      }
      if (this.failNext?.nsid === method.$nsid) {
        const { error } = this.failNext
        this.failNext = null
        throw new LexError(error, `fake ${error}`)
      }
      try {
        return assertOutput(method, await this.dispatch(store, method.$nsid, input))
      } catch (err) {
        if (err instanceof RecordExists) throw new LexError('RecordAlreadyExists', err.message)
        if (err instanceof SpaceExists) throw new LexError('SpaceAlreadyExists', err.message)
        if (err instanceof SpaceNotFound) throw new LexError('SpaceNotFound', err.message)
        throw err
      }
    }
    return {
      call,
      /** Only getBlob, whose response encoding the server reads. */
      xrpc: async (method: { $nsid: string }, options: { params: Record<string, unknown> }) => {
        if (method.$nsid !== atproto.space.getBlob.$nsid)
          throw new Error(`FakePds.xrpc does not implement ${method.$nsid}`)
        const body = await call(method, options.params)
        const blob = this.blobs.get(options.params.cid as string)
        return { body, encoding: blob?.mimeType }
      },
    }
  }

  private async dispatch(store: LocalRecordStore, nsid: string, input: Record<string, unknown>) {
    const space = input.space as string
    const uri = (collection: string, rkey: string) => `${space}/${store.did}/${collection}/${rkey}`
    switch (nsid) {
      case atproto.simplespace.createSpace.$nsid:
        return { uri: await store.createSpace(input.type as string, input.skey as string) }
      case atproto.simplespace.deleteSpace.$nsid:
        return store.deleteSpace(space)
      case atproto.space.getRecord.$nsid: {
        const record = await store.getRecord(
          space,
          input.collection as string,
          input.rkey as string,
        )
        if (!record) throw new LexError('RecordNotFound', 'not found')
        return {
          uri: uri(input.collection as string, record.rkey),
          cid: record.cid,
          value: toLex(record.value),
        }
      }
      case atproto.space.listRecords.$nsid: {
        const collections = input.collection
          ? [input.collection as string]
          : [...new Set((await store.listKeys(space)).map((key) => key.collection))]
        const records = []
        for (const collection of collections) {
          for (const record of await store.listRecords(space, collection)) {
            records.push({
              collection,
              rkey: record.rkey,
              cid: record.cid,
              ...(input.excludeValues ? {} : { value: toLex(record.value) }),
            })
          }
        }
        return { records }
      }
      case atproto.space.createRecord.$nsid:
      case atproto.space.putRecord.$nsid: {
        const write = nsid === atproto.space.createRecord.$nsid ? 'createRecord' : 'putRecord'
        const collection = input.collection as string
        const rkey = input.rkey as string
        const { cid } = await store[write](space, collection, rkey, toJson(input.record))
        return { uri: uri(collection, rkey), cid }
      }
      case atproto.space.deleteRecord.$nsid:
        await store.deleteRecord(space, input.collection as string, input.rkey as string)
        return {}
      case atproto.space.listRepoOps.$nsid: {
        const head = await store.headRev(space)
        if (!head) throw new LexError('RepoNotFound', 'no repo in space')
        const since = input.since ? fromTid(input.since as string) : undefined
        const page = await store.listOps(space, since)
        const prevs = await this.prevCids(store, space)
        const ops = page.ops.map((op) => ({
          ...op,
          prev: prevs.get(`${op.rev}/${op.collection}/${op.rkey}`) ?? null,
          rev: toTid(op.rev),
          value: op.value ? toLex(op.value) : undefined,
        }))
        return { ops, commit: await this.commit(store, space, toTid(head)) }
      }
      case atproto.space.getLatestCommit.$nsid: {
        const rev = await store.headRev(space)
        if (!rev) throw new LexError('RepoNotFound', 'no repo in space')
        return { commit: await this.commit(store, space, toTid(rev)) }
      }
      case atproto.space.getBlob.$nsid: {
        const cid = input.cid as string
        const referenced = await this.db
          .selectFrom('local_record')
          .select('rkey')
          .where('space_uri', '=', space)
          .where('value_json', 'like', `%${cid}%`)
          .executeTakeFirst()
        const blob = this.blobs.get(cid)
        if (!referenced || !blob) throw new LexError('BlobNotFound', 'blob not found in space')
        return blob.bytes
      }
      case atproto.simplespace.getSpace.$nsid:
        return {
          uri: space,
          readPolicy: { $type: this.policy(space).readPolicy },
          writePolicy: { $type: 'com.atproto.simplespace.defs#memberListPolicy' },
          appAccess: { $type: 'com.atproto.simplespace.defs#open' },
        }
      case atproto.simplespace.updateSpace.$nsid:
        if (input.readPolicy)
          this.policy(space).readPolicy = (input.readPolicy as { $type: string }).$type
        return undefined
      case atproto.simplespace.listMembers.$nsid:
        return {
          members: [...this.policy(space).members].map(([did, access]) => ({ did, ...access })),
        }
      case atproto.simplespace.putMember.$nsid:
        this.policy(space).members.set(input.did as string, {
          read: input.read as boolean,
          write: input.write as boolean,
        })
        return undefined
      case atproto.simplespace.removeMember.$nsid:
        this.policy(space).members.delete(input.did as string)
        return undefined
      case atproto.space.listSpaces.$nsid:
        return { spaces: (await store.listSpaces(input.type as string)).map((u) => ({ uri: u })) }
      default:
        throw new Error(`FakePds does not implement ${nsid}`)
    }
  }

  /** Each op's previous CID for its record, as a PDS reports it, keyed by rev and record. */
  private async prevCids(store: LocalRecordStore, space: string) {
    const prevs = new Map<string, string | null>()
    const latest = new Map<string, string | null>()
    for (const op of (await store.listOps(space)).ops) {
      const key = `${op.collection}/${op.rkey}`
      prevs.set(`${op.rev}/${key}`, latest.get(key) ?? null)
      latest.set(key, op.cid)
    }
    return prevs
  }

  private async commit(store: LocalRecordStore, space: string, rev: string) {
    const keys = await store.listKeys(space)
    const records = keys.map((key) => ({
      collection: key.collection,
      rkey: key.rkey,
      cid: parseCid(key.cid),
    }))
    if (this.tamperCommits) {
      records.push({
        collection: 'network.sharedcomputer.chat.message',
        rkey: 'phantom',
        cid: parseCid(keys[0]?.cid ?? ''),
      })
    }
    return RepoCommit.fromRecords(records as any).sign(
      { space, author: store.did, rev } as any,
      this.keypair,
    )
  }

  ownerOf(space: string): string {
    return parseSpaceUri(space).did
  }
}
