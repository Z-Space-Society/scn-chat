import type { SyncConfig } from '../config.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { SyncEngine } from './engine.ts'

export type ResolvedSyncConfig = {
  safetyNet: { enabled: boolean; intervalMinutes: number; activeWithinHours: number }
  discovery: { intervalMinutes: number; activeWithinDays: number }
  allowUserOptOut: boolean
}

export function resolveSyncConfig(config: SyncConfig = {}): ResolvedSyncConfig {
  return {
    safetyNet: {
      enabled: config.safetyNet?.enabled ?? true,
      intervalMinutes: config.safetyNet?.intervalMinutes ?? 15,
      activeWithinHours: config.safetyNet?.activeWithinHours ?? 24,
    },
    discovery: {
      intervalMinutes: config.discovery?.intervalMinutes ?? 60,
      activeWithinDays: config.discovery?.activeWithinDays ?? 30,
    },
    allowUserOptOut: config.allowUserOptOut ?? true,
  }
}

/** Spaces users active since the cutoff who have not turned off background sync. */
export async function eligibleUsers(
  db: Db,
  config: ResolvedSyncConfig,
  activeSince: Date,
): Promise<string[]> {
  let query = db
    .selectFrom('account')
    .select('did')
    .where('storage_mode', '=', 'space')
    .where('last_active_at', '>=', activeSince.toISOString())
  if (config.allowUserOptOut) query = query.where('background_sync', '=', 1)
  return (await query.execute()).map((row) => row.did)
}

/** Timers for registration renewal, the safety net, and discovery. */
export function startSyncScheduler(deps: {
  engine: SyncEngine
  db: Db
  config: ResolvedSyncConfig
  logger: Logger
}) {
  const { engine, db, config, logger } = deps
  const run = (name: string, work: () => Promise<void>) => () => {
    work().catch((err) => logger.error({ err, job: name }, 'sync job failed'))
  }
  const forEach = async (users: string[], fn: (did: string) => Promise<void>) => {
    for (const did of users) {
      await fn(did).catch((err) => logger.warn({ err, did }, 'sync job failed for user'))
    }
  }
  const timers = [
    setInterval(
      run('renew', () => engine.renewRegistrations()),
      5 * 60_000,
    ),
  ]
  if (config.safetyNet.enabled) {
    timers.push(
      setInterval(
        run('safety-net', async () => {
          const since = new Date(Date.now() - config.safetyNet.activeWithinHours * 3_600_000)
          await forEach(await eligibleUsers(db, config, since), (did) => engine.safetyNet(did))
        }),
        config.safetyNet.intervalMinutes * 60_000,
      ),
    )
  }
  timers.push(
    setInterval(
      run('discovery', async () => {
        const since = new Date(Date.now() - config.discovery.activeWithinDays * 86_400_000)
        await forEach(await eligibleUsers(db, config, since), (did) => engine.discover(did))
      }),
      config.discovery.intervalMinutes * 60_000,
    ),
  )
  return () => {
    for (const timer of timers) clearInterval(timer)
  }
}
