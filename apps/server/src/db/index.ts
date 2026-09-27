import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import SqliteDatabase from 'better-sqlite3'
import { Kysely, PostgresDialect, SqliteDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema.ts'

export type Db = Kysely<Database>

export class UnsupportedDatabaseError extends Error {
  constructor(url: string) {
    const scheme = url.split(':')[0]
    super(`Unsupported DATABASE_URL scheme "${scheme}:". Use sqlite:<path> or postgres://...`)
    this.name = 'UnsupportedDatabaseError'
  }
}

/** Open the database named by a DATABASE_URL. */
export function createDb(url: string): Db {
  if (url.startsWith('sqlite:')) {
    const path = url.slice('sqlite:'.length)
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    const sqlite = new SqliteDatabase(path)
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) })
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return new Kysely<Database>({
      dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
    })
  }
  throw new UnsupportedDatabaseError(url)
}
