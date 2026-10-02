import type { Kysely } from 'kysely'
import type { Migration } from 'kysely/migration'
import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const fixtures: Record<string, Migration> = {
  '0001_first': {
    up: async (db: Kysely<unknown>) => {
      await db.schema
        .createTable('fixture')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .execute()
    },
  },
  '0002_second': {
    up: async (db: Kysely<unknown>) => {
      await db.schema.alterTable('fixture').addColumn('value', 'text').execute()
    },
  },
}

describe.each(dialects)('migrateToLatest on $name', ({ create }) => {
  it('reports the migrations it applied, and none when run again', async () => {
    const db = create()
    expect((await migrateToLatest(db, fixtures)).applied).toEqual(['0001_first', '0002_second'])
    expect((await migrateToLatest(db, fixtures)).applied).toEqual([])
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
})
