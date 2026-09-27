import type { JsonRecord } from './records.ts'

export type StoredRecord = { rkey: string; value: JsonRecord; cid: string }
export type RecordKey = { collection: string; rkey: string; cid: string }
export type Op = {
  rev: string
  collection: string
  rkey: string
  cid: string | null
  /** The previous CID, null for a create. Absent when the backend does not track it. */
  prev?: string | null
  value?: JsonRecord
}
export type SignedCommit = Record<string, unknown>
export type OpsPage = {
  ops: Op[]
  rev: string | null
  /** The signed commit at the head, missing only when the account has no repo in the space. */
  commit?: SignedCommit
}

export type SpacePolicy = { read: 'memberList' | 'public' }

/** A PDS-shaped store of one user's records, backed by their PDS or by the local fallback. */
export interface RecordStore {
  readonly did: string
  createSpace(type: string, skey: string): Promise<string>
  deleteSpace(space: string): Promise<void>
  getRecord(space: string, collection: string, rkey: string): Promise<StoredRecord | null>
  listRecords(space: string, collection: string): Promise<StoredRecord[]>
  listKeys(space: string): Promise<RecordKey[]>
  createRecord(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
  ): Promise<{ cid: string }>
  putRecord(
    space: string,
    collection: string,
    rkey: string,
    value: JsonRecord,
  ): Promise<{ cid: string }>
  deleteRecord(space: string, collection: string, rkey: string): Promise<void>
  /** Every op after `since`, and the revision to pass next time. */
  listOps(space: string, since?: string | null): Promise<OpsPage>
  /** The newest revision, without reading the op log. */
  headRev(space: string): Promise<string | null>
  listSpaces(type: string): Promise<string[]>
}

export class RecordExists extends Error {
  constructor(space: string, collection: string, rkey: string) {
    super(`A ${collection} record already exists at ${rkey} in ${space}`)
    this.name = 'RecordExists'
  }
}

export class SpaceExists extends Error {
  constructor(space: string) {
    super(`Space already exists: ${space}`)
    this.name = 'SpaceExists'
  }
}

export class InvalidCursor extends Error {
  constructor(since: string) {
    super(`Not a revision from this store: ${since}`)
    this.name = 'InvalidCursor'
  }
}

export class SpaceNotFound extends Error {
  constructor(space: string) {
    super(`Space not found: ${space}`)
    this.name = 'SpaceNotFound'
  }
}

/** A record on the PDS that doesn't match its lexicon. */
export class InvalidStoredRecord extends Error {
  readonly collection: string

  constructor(space: string, collection: string, rkey: string, details: string) {
    super(`The ${collection} record ${rkey} in ${space} does not match its lexicon: ${details}`)
    this.name = 'InvalidStoredRecord'
    this.collection = collection
  }
}

export class InvalidRecord extends Error {
  readonly collection: string

  constructor(collection: string, details: string) {
    super(`Invalid ${collection} record: ${details}`)
    this.name = 'InvalidRecord'
    this.collection = collection
  }
}
