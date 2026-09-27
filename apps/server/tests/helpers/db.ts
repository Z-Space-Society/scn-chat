import { PGlite } from '@electric-sql/pglite'
import SqliteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { PGliteDialect } from 'kysely-pglite-dialect'
import type { Db } from '../../src/db/index.ts'
import type { Database } from '../../src/db/schema.ts'

export type Dialect = { name: 'sqlite' | 'postgres'; create: () => Db }

export function createSqliteDb(): Db {
  const sqlite = new SqliteDatabase(':memory:')
  sqlite.pragma('foreign_keys = ON')
  return new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) })
}

/** Both databases, for tests that must pass on each. */
export const dialects: Dialect[] = [
  { name: 'sqlite', create: createSqliteDb },
  {
    name: 'postgres',
    create: () => new Kysely<Database>({ dialect: new PGliteDialect(new PGlite()) }),
  },
]
