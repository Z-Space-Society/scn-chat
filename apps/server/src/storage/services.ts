import type { Account } from '../auth/accounts.ts'
import type { PdsClientFactory } from '../auth/pds.ts'
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

/** Build each user's ChatService over the backend for their storage mode. */
export function createChatServices(deps: {
  db: Db
  getPdsClient: PdsClientFactory
  logger: Logger
  events: SyncEventBus
  recentWrites: RecentWrites
}): ChatServices {
  const storeFor = (account: Account): RecordStore =>
    account.storageMode === 'space'
      ? new SpaceRecordStore(account.did, deps.getPdsClient)
      : new LocalRecordStore(account.did, deps.db)
  return {
    storeFor,
    forAccount(account) {
      const chats: ChatService = new ChatService(storeFor(account), deps.logger, (space, cid) => {
        deps.recentWrites.add(cid)
        if (space === chats.settingsUri) deps.events.emit('index:changed', { did: account.did })
        else
          deps.events.emit('conversation:changed', { did: account.did, skey: chats.skeyOf(space) })
      })
      return chats
    },
  }
}
