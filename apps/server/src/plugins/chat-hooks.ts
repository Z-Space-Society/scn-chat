import { nsid } from '@scn-chat/lexicons'
import type { Logger } from '../logger.ts'
import { spaceUri } from '../storage/records.ts'
import type { SyncEventBus } from '../sync/events.ts'
import type { HookRunner } from './hooks.ts'

/**
 * Tell plugins about each conversation created or deleted, whether this app made the change or
 * sync noticed another client make it. The events come once per change, so the hooks do too.
 */
export function fireChatHooks(events: SyncEventBus, hooks: () => HookRunner, logger: Logger) {
  const conversation = (did: string, skey: string) => ({
    user: did,
    conversation: spaceUri(did, nsid.conversation, skey),
  })
  events.on(
    'conversation:created',
    ({ did, skey }) => void hooks().action('conversation:created', conversation(did, skey), logger),
  )
  events.on(
    'conversation:deleted',
    ({ did, skey }) => void hooks().action('conversation:deleted', conversation(did, skey), logger),
  )
}
