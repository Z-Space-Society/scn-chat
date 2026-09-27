import { type Kysely, sql } from 'kysely'
import type { Migration } from 'kysely/migration'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const order: string[] = []

const fixtures: Record<string, Migration> = {
  '0001_first': {
    up: async (db: Kysely<unknown>) => {
      order.push('0001_first')
      await db.schema
        .createTable('fixture')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .execute()
    },
  },
  '0002_second': {
    up: async (db: Kysely<unknown>) => {
      order.push('0002_second')
      await db.schema.alterTable('fixture').addColumn('value', 'text').execute()
    },
  },
}

afterEach(() => {
  order.length = 0
})

describe.each(dialects)('migrateToLatest on $name', ({ create }) => {
  it('applies pending migrations in order', async () => {
    const db = create()
    const { applied } = await migrateToLatest(db, fixtures)
    expect(applied).toEqual(['0001_first', '0002_second'])
    expect(order).toEqual(['0001_first', '0002_second'])
    await sql`insert into fixture (id, value) values ('a', 'b')`.execute(db)
    await db.destroy()
  })

  it('applies nothing when run again', async () => {
    const db = create()
    await migrateToLatest(db, fixtures)
    const { applied } = await migrateToLatest(db, fixtures)
    expect(applied).toEqual([])
    await db.destroy()
  })

  it('fails loudly when a migration throws', async () => {
    const db = create()
    const broken: Record<string, Migration> = {
      '0001_broken': {
        up: async () => {
          throw new Error('boom')
        },
      },
    }
    await expect(migrateToLatest(db, broken)).rejects.toThrow('boom')
    await db.destroy()
  })

  it('runs the app migrations cleanly', async () => {
    const db = create()
    await expect(migrateToLatest(db)).resolves.toBeDefined()
    await db.destroy()
  })
})
