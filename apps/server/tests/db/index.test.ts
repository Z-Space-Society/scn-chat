import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'kysely'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, UnsupportedDatabaseError } from '../../src/db/index.ts'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})

describe('createDb', () => {
  it('opens a working SQLite database for a sqlite: URL, creating its directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scn-db-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const db = createDb(`sqlite:${join(dir, 'nested', 'app.sqlite')}`)
    cleanup.push(() => db.destroy())
    const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db)
    expect(rows[0]?.one).toBe(1)
  })

  it('turns on WAL mode for file databases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scn-db-'))
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
    const db = createDb(`sqlite:${join(dir, 'app.sqlite')}`)
    cleanup.push(() => db.destroy())
    const { rows } = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(db)
    expect(rows[0]?.journal_mode).toBe('wal')
  })

  it('creates a Postgres database for a postgres:// URL without connecting', () => {
    const db = createDb('postgres://user:pass@localhost:5432/scn')
    cleanup.push(() => db.destroy())
    expect(db).toBeDefined()
  })

  it('rejects an unsupported scheme with a clear message', () => {
    expect(() => createDb('mysql://localhost/scn')).toThrow(UnsupportedDatabaseError)
    expect(() => createDb('mysql://localhost/scn')).toThrow(
      /Unsupported DATABASE_URL scheme "mysql:"/,
    )
  })
})
