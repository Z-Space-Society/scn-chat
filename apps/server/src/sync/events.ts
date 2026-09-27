import { EventEmitter } from 'node:events'
import type { JsonRecord } from '../storage/records.ts'

export type SyncEvents = {
  'message:changed': [
    {
      did: string
      skey: string
      rkey: string
      record: JsonRecord
      cid: string
      kind: 'create' | 'update'
      live: boolean
    },
  ]
  'message:invalid': [{ did: string; skey: string; rkey: string; raw: JsonRecord; error: string }]
  'conversation:changed': [{ did: string; skey: string }]
  'conversation:deleted': [{ did: string; skey: string }]
  'index:changed': [{ did: string }]
}

/** In-process events about chat changes, for turns and for open browser tabs. */
export class SyncEventBus extends EventEmitter<SyncEvents> {}
