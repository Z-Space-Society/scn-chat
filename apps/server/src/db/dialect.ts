import { type ColumnDefinitionBuilder, type Kysely, PostgresAdapter } from 'kysely'

export function isPostgres(db: Kysely<unknown>): boolean {
  return db.getExecutor().adapter instanceof PostgresAdapter
}

/** An auto-incrementing integer primary key on either database. */
export function autoIncrementKey(db: Kysely<unknown>) {
  const postgres = isPostgres(db)
  return {
    type: postgres ? ('serial' as const) : ('integer' as const),
    build: (col: ColumnDefinitionBuilder) =>
      postgres ? col.primaryKey() : col.primaryKey().autoIncrement(),
  }
}
