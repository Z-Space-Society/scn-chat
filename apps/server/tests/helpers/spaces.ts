import { nsid } from '@scn-chat/lexicons'
import pino from 'pino'
import { vi } from 'vitest'
import { recordLogin } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { createChatServices } from '../../src/storage/services.ts'
import type { CredentialCache } from '../../src/sync/credentials.ts'
import { SyncEngine } from '../../src/sync/engine.ts'
import { SyncEventBus } from '../../src/sync/events.ts'
import { RecentWrites } from '../../src/sync/recent-writes.ts'
import { createSqliteDb } from './db.ts'
import { FakePds } from './fake-pds.ts'

export const ALICE = 'did:plc:alice'

export const textContent = (text: string) => ({
  $type: `${nsid.defs}#plainContent`,
  parts: [{ $type: `${nsid.defs}#textPart`, text }],
})

export const userMessage = (text: string, extra: Record<string, unknown> = {}) => ({
  $type: nsid.message,
  role: 'user',
  content: textContent(text),
  createdAt: new Date().toISOString(),
  ...extra,
})

/** A spaces account on a fake PDS, with the services and sync engine the server would build. */
export async function spacesHarness(
  options: { backfillWindowMs?: number; storageMode?: 'space' | 'local' } = {},
) {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const logger = pino({ level: 'silent' })
  const pds = await FakePds.create(db)
  const events = new SyncEventBus()
  const recentWrites = new RecentWrites()
  const services = createChatServices({
    db,
    getPdsClient: async (did) => pds.client(did) as never,
    logger,
    events,
    recentWrites,
  })
  const account = await recordLogin(db, {
    did: ALICE,
    handle: 'alice.test',
    pdsUrl: 'https://pds.test',
    spacesAllowed: (options.storageMode ?? 'space') === 'space',
  })
  const credentials = {
    withCredential: vi.fn(
      async (_did: string, _space: string, fn: (credential: unknown) => Promise<unknown>) =>
        fn({
          client: () => ({
            call: async () => ({ expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
          }),
        }),
    ),
  } as unknown as CredentialCache
  const engine = new SyncEngine({
    db,
    services,
    events,
    recentWrites,
    credentials,
    resolveSigningKey: async () => pds.keypair.did(),
    publicUrl: 'https://chat.example.com',
    logger,
    backfillWindowMs: options.backfillWindowMs ?? 60 * 60_000,
  })
  /** Write as another client would, straight to the PDS, bypassing the server's services. */
  const external = services.storeFor(account)
  const chats = services.forAccount(account)
  await chats.ensureSettingsSpace()
  return { db, pds, events, recentWrites, services, account, chats, engine, external, logger }
}

export function collect<E extends string>(events: SyncEventBus, name: E) {
  const seen: unknown[] = []
  events.on(name as never, ((payload: unknown) => seen.push(payload)) as never)
  return seen as never[]
}
