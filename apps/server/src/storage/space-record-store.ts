import type { Client } from '@atproto/lex-client'
import { atproto } from '@scn-chat/lexicons'
import type { PdsClientFactory } from '../auth/pds.ts'
import { lexErrorCode } from '../lex-errors.ts'
import type { Loose } from '../loose.ts'
import {
  type OpsPage,
  RecordExists,
  type RecordKey,
  type RecordStore,
  SpaceExists,
  SpaceNotFound,
  type StoredRecord,
} from './record-store.ts'
import { type JsonRecord, toJson, toLex } from './records.ts'
import { MEMBER_LIST, OPEN } from './space-policies.ts'
import { assertValidRecord } from './validate.ts'

const PAGE = 100

/** A user's records on their spaces-enabled PDS. */
export class SpaceRecordStore implements RecordStore {
  readonly did: string
  private readonly getClient: PdsClientFactory

  constructor(did: string, getClient: PdsClientFactory) {
    this.did = did
    this.getClient = getClient
  }

  private async client(): Promise<Client> {
    return this.getClient(this.did)
  }

  private async rawCall(method: Loose, input: Loose): Promise<Loose> {
    const client: Loose = await this.client()
    return client.call(method, input)
  }

  private async call(method: Loose, input: Loose, space: string): Promise<Loose> {
    try {
      return await this.rawCall(method, input)
    } catch (err) {
      if (lexErrorCode(err) === 'SpaceNotFound') throw new SpaceNotFound(space)
      throw err
    }
  }

  async createSpace(type: string, skey: string): Promise<string> {
    try {
      const { uri } = await this.rawCall(atproto.simplespace.createSpace, {
        spaceType: type,
        skey,
        readPolicy: MEMBER_LIST,
        writePolicy: MEMBER_LIST,
        appAccess: OPEN,
      })
      return uri as string
    } catch (err) {
      if (lexErrorCode(err) === 'SpaceAlreadyExists')
        throw new SpaceExists(`at://${this.did}/space/${type}/${skey}`)
      throw err
    }
  }

  async deleteSpace(space: string): Promise<void> {
    await this.call(atproto.simplespace.deleteSpace, { space }, space)
  }

  async getRecord(space: string, collection: string, rkey: string): Promise<StoredRecord | null> {
    try {
      const out = await this.rawCall(atproto.space.getRecord, {
        space,
        repo: this.did,
        collection,
        rkey,
      })
      return { rkey, value: toJson(out.value), cid: out.cid }
    } catch (err) {
      if (lexErrorCode(err) === 'RecordNotFound' || lexErrorCode(err) === 'RepoNotFound')
        return null
      if (lexErrorCode(err) === 'SpaceNotFound') throw new SpaceNotFound(space)
      throw err
    }
  }

  private async listAll(space: string, params: Record<string, unknown>): Promise<Loose[]> {
    const records: Loose[] = []
    let cursor: string | undefined
    do {
      let out: Loose
      try {
        out = await this.call(
          atproto.space.listRecords,
          { space, repo: this.did, limit: PAGE, cursor, ...params },
          space,
        )
      } catch (err) {
        if (lexErrorCode(err) === 'RepoNotFound') return records
        throw err
      }
      records.push(...out.records)
      cursor = out.cursor
    } while (cursor)
    return records
  }

  async listRecords(space: string, collection: string): Promise<StoredRecord[]> {
    const records = await this.listAll(space, { collection })
    return records.map((record) => ({
      rkey: record.rkey,
      value: toJson(record.value),
      cid: record.cid,
    }))
  }

  async listKeys(space: string): Promise<RecordKey[]> {
    const records = await this.listAll(space, { excludeValues: true })
    return records.map((record) => ({
      collection: record.collection,
      rkey: record.rkey,
      cid: record.cid,
    }))
  }

  async createRecord(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
  ): Promise<{ cid: string }> {
    assertValidRecord(collection, value)
    try {
      const out = await this.rawCall(atproto.space.createRecord, {
        space,
        repo: this.did,
        collection,
        rkey,
        validate: false,
        record: toLex(value),
      })
      return { cid: out.cid }
    } catch (err) {
      if (lexErrorCode(err) === 'RecordAlreadyExists')
        throw new RecordExists(space, collection, rkey)
      if (lexErrorCode(err) === 'SpaceNotFound') throw new SpaceNotFound(space)
      throw err
    }
  }

  async putRecord(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
  ): Promise<{ cid: string }> {
    assertValidRecord(collection, value)
    const out = await this.call(
      atproto.space.putRecord,
      { space, repo: this.did, collection, rkey, validate: false, record: toLex(value) },
      space,
    )
    return { cid: out.cid }
  }

  async deleteRecord(space: string, collection: string, rkey: string): Promise<void> {
    await this.call(atproto.space.deleteRecord, { space, repo: this.did, collection, rkey }, space)
  }

  async listOps(space: string, since?: string | null): Promise<OpsPage> {
    const page: OpsPage = { ops: [], rev: since ?? null }
    let cursor: string | undefined
    do {
      let out: Loose
      try {
        out = await this.call(
          atproto.space.listRepoOps,
          { space, repo: this.did, since: since ?? undefined, cursor, limit: PAGE },
          space,
        )
      } catch (err) {
        if (lexErrorCode(err) === 'RepoNotFound') return page
        throw err
      }
      for (const op of out.ops) {
        page.ops.push({
          rev: op.rev,
          collection: op.collection,
          rkey: op.rkey,
          cid: op.cid,
          prev: op.prev,
          value: op.value === undefined ? undefined : toJson(op.value),
        })
        page.rev = op.rev
      }
      cursor = out.cursor
      if (!cursor) page.commit = out.commit
    } while (cursor)
    if (!page.commit) throw new Error(`listRepoOps reached the head of ${space} without a commit`)
    return page
  }

  async headRev(space: string): Promise<string | null> {
    try {
      const out = await this.call(atproto.space.getLatestCommit, { space, repo: this.did }, space)
      return out.commit.rev
    } catch (err) {
      if (lexErrorCode(err) === 'RepoNotFound') return null
      throw err
    }
  }

  async listSpaces(type: string): Promise<string[]> {
    const uris: string[] = []
    let cursor: string | undefined
    do {
      const out = await this.rawCall(atproto.space.listSpaces, {
        spaceType: type,
        cursor,
        limit: PAGE,
      })
      uris.push(...out.spaces.map((space: { uri: string }) => space.uri))
      cursor = out.cursor
    } while (cursor)
    return uris
  }
}
