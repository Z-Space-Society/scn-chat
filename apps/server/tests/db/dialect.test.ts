import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '../../src/db/dialect.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

describe.each(dialects)('isUniqueViolation on $name', ({ create }) => {
  it('recognizes a duplicate key insert, and nothing else', async () => {
    const db = create()
    await migrateToLatest(db)
    const row = {
      uri: 'at://x/space/t/k',
      owner_did: 'did:plc:x',
      type: 't',
      skey: 'k',
      created_at: 'now',
    }
    await db.insertInto('local_space').values(row).execute()
    const duplicate = await db
      .insertInto('local_space')
      .values(row)
      .execute()
      .catch((err) => err)
    expect(isUniqueViolation(duplicate)).toBe(true)
    expect(isUniqueViolation(new Error('something else'))).toBe(false)
    await db.destroy()
  })
})
