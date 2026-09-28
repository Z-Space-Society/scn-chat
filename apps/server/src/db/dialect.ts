import { type ColumnDefinitionBuilder, type Kysely, PostgresAdapter } from 'kysely'

export function isPostgres(db: Kysely<unknown>): boolean {
  return db.getExecutor().adapter instanceof PostgresAdapter
}

/** Did an insert fail because the key is already taken, on either database? */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown }).code
  return (
    code === '23505' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
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
