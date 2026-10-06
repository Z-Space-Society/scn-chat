import type { Db } from './db/index.ts'
import type { Logger } from './logger.ts'
import type { RuntimeHolder } from './plugins/runtime.ts'

export const CRON_TIME_LIMIT_MS = 10 * 60_000

export type CronRun = { startedAt: string; finishedAt: string | null; failed: string[] }

export class CronRunning extends Error {
  constructor() {
    super('A cron run is already going')
    this.name = 'CronRunning'
  }
}

export type CronDeps = {
  db: Db
  plugins: Pick<RuntimeHolder, 'acquire'>
  logger: Logger
  timeLimitMs?: number
}

/** Runs every plugin's cron hook, one run at a time, and records the last run. */
export class Cron {
  private readonly deps: CronDeps
  private running = false

  constructor(deps: CronDeps) {
    this.deps = deps
  }

  async run(): Promise<CronRun> {
    if (this.running) throw new CronRunning()
    this.running = true
    try {
      const startedAt = new Date().toISOString()
      await this.record({ startedAt, finishedAt: null, failed: [] })
      const lease = this.deps.plugins.acquire()
      const failed = await lease.runtime.host.hooks
        .action(
          'cron',
          { startedAt },
          this.deps.logger,
          AbortSignal.timeout(this.deps.timeLimitMs ?? CRON_TIME_LIMIT_MS),
        )
        .finally(() => lease.release())
      const run = { startedAt, finishedAt: new Date().toISOString(), failed }
      await this.record(run)
      this.deps.logger.info(run, 'cron run finished')
      return run
    } finally {
      this.running = false
    }
  }

  async lastRun(): Promise<CronRun | null> {
    const row = await this.deps.db.selectFrom('cron_run').selectAll().executeTakeFirst()
    return row
      ? {
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          failed: JSON.parse(row.failed_json) as string[],
        }
      : null
  }

  private async record(run: CronRun) {
    const values = {
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      failed_json: JSON.stringify(run.failed),
    }
    await this.deps.db
      .insertInto('cron_run')
      .values({ id: 1, ...values })
      .onConflict((oc) => oc.column('id').doUpdateSet(values))
      .execute()
  }
}
