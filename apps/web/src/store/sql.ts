export type SqlValue = string | number | null
export type Row = Record<string, SqlValue>

/** The few SQL operations the store needs, over SQLite in a worker or in tests. */
export interface SqlDb {
  run(sql: string, params?: SqlValue[]): void
  all<T extends Row = Row>(sql: string, params?: SqlValue[]): T[]
  transaction(fn: () => void): void
}
