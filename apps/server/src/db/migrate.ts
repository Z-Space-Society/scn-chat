import { type Migration, Migrator } from 'kysely/migration'
import type { Db } from './index.ts'
import { migrations as appMigrations } from './migrations/index.ts'

export type MigrationOutcome = { applied: string[] }

/** Run every pending migration, failing loudly if any migration fails. */
export async function migrateToLatest(
  db: Db,
  migrations: Record<string, Migration> = appMigrations,
): Promise<MigrationOutcome> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } })
  const { error, results = [] } = await migrator.migrateToLatest()
  if (error) throw error instanceof Error ? error : new Error(String(error))
  return {
    applied: results
      .filter((result) => result.status === 'Success')
      .map((result) => result.migrationName),
  }
}
