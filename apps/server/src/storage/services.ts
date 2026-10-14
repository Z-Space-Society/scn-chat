import type { Account } from '../auth/accounts.ts'
import type { PdsClientFactory } from '../auth/pds.ts'
import { type BlobStore, LocalBlobStore, SpaceBlobStore } from '../blobs/store.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { SyncEventBus } from '../sync/events.ts'
import type { RecentWrites } from '../sync/recent-writes.ts'
import { ChatService } from './chat-service.ts'
import { LocalRecordStore } from './local-record-store.ts'
import type { RecordStore } from './record-store.ts'
import { SpaceRecordStore } from './space-record-store.ts'

export type ChatServices = {
  forAccount(account: Account): ChatService
  storeFor(account: Account): RecordStore
}

/**
 * Build each user's ChatService over the records and blobs for their storage mode, the one place
 * that chooses between a spaces PDS and the local fallback.
 */
export function createChatServices(deps: {
  db: Db
  getPdsClient: PdsClientFactory
  /** Where fallback users' blobs are kept. */
  dataDir: string
  logger: Logger
  events: SyncEventBus
  recentWrites: RecentWrites
}): ChatServices {
  const storeFor = (account: Account): RecordStore =>
    account.storageMode === 'space'
      ? new SpaceRecordStore(account.did, deps.getPdsClient)
      : new LocalRecordStore(account.did, deps.db)
  const blobsFor = (account: Account): BlobStore =>
    account.storageMode === 'space'
      ? new SpaceBlobStore(account.did, deps.getPdsClient)
      : new LocalBlobStore(account.did, deps.dataDir)
  return {
    storeFor,
    forAccount(account) {
      const store = storeFor(account)
      const chats: ChatService = new ChatService(
        store,
        blobsFor(account),
        deps.logger,
        (space, cid) => {
          deps.recentWrites.add(cid)
          if (space === chats.settingsUri) deps.events.emit('index:changed', { did: account.did })
          else
            deps.events.emit('conversation:changed', {
              did: account.did,
              skey: chats.skeyOf(space),
            })
        },
      )
      return chats
    },
  }
}
