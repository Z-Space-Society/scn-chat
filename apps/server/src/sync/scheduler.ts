import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { Settings } from '../settings/schemas.ts'
import type { SyncEngine } from './engine.ts'

export type SyncSettings = Settings['sync']

/** Spaces users with access, active since the cutoff, who have not turned off background sync. */
export async function eligibleUsers(
  db: Db,
  config: SyncSettings,
  activeSince: Date,
  hasAccess: (did: string) => Promise<boolean>,
): Promise<string[]> {
  let query = db
    .selectFrom('account')
    .select('did')
    .where('storage_mode', '=', 'space')
    .where('viewer_only', '=', 0)
    .where('last_active_at', '>=', activeSince.toISOString())
  if (config.allowUserOptOut) query = query.where('background_sync', '=', 1)
  const dids = (await query.execute()).map((row) => row.did)
  const allowed = await Promise.all(dids.map(hasAccess))
  return dids.filter((_, index) => allowed[index])
}

export type SchedulerDeps = {
  engine: SyncEngine
  db: Db
  /** The current sync settings. */
  sync: () => SyncSettings
  /** Call the listener whenever the sync settings change. */
  onSyncChange: (listener: () => void) => () => void
  hasAccess: (did: string) => Promise<boolean>
  logger: Logger
}

/** Timers for registration renewal, the safety net, and discovery, restarted when the sync settings change. */
export function startSyncScheduler(deps: SchedulerDeps) {
  const { engine, db, logger } = deps
  const run = (name: string, work: () => Promise<void>) => () => {
    work().catch((err) => logger.error({ err, job: name }, 'sync job failed'))
  }
  const forEach = async (users: string[], fn: (did: string) => Promise<void>) => {
    for (const did of users) {
      await fn(did).catch((err) => logger.warn({ err, did }, 'sync job failed for user'))
    }
  }
  const users = (since: Date) => eligibleUsers(db, deps.sync(), since, deps.hasAccess)
  const renew = setInterval(
    run('renew', () => engine.renewRegistrations()),
    5 * 60_000,
  )
  let timers: NodeJS.Timeout[] = []
  const schedule = () => {
    for (const timer of timers) clearInterval(timer)
    const config = deps.sync()
    timers = []
    if (config.safetyNet.enabled) {
      timers.push(
        setInterval(
          run('safety-net', async () => {
            const since = new Date(Date.now() - config.safetyNet.activeWithinHours * 3_600_000)
            await forEach(await users(since), (did) => engine.safetyNet(did))
          }),
          config.safetyNet.intervalMinutes * 60_000,
        ),
      )
    }
    timers.push(
      setInterval(
        run('discovery', async () => {
          const since = new Date(Date.now() - config.discovery.activeWithinDays * 86_400_000)
          await forEach(await users(since), (did) => engine.discover(did))
        }),
        config.discovery.intervalMinutes * 60_000,
      ),
    )
  }
  schedule()
  const unsubscribe = deps.onSyncChange(schedule)
  return () => {
    unsubscribe()
    clearInterval(renew)
    for (const timer of timers) clearInterval(timer)
  }
}
