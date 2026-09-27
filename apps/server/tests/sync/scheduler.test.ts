import { describe, expect, it } from 'vitest'
import { recordLogin, setBackgroundSync } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { eligibleUsers, resolveSyncConfig } from '../../src/sync/scheduler.ts'
import { createSqliteDb } from '../helpers/db.ts'

async function accounts() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const base = { handle: null, pdsUrl: 'https://pds.test' }
  await recordLogin(db, { ...base, did: 'did:plc:active', spacesAllowed: true })
  await recordLogin(db, { ...base, did: 'did:plc:optedout', spacesAllowed: true })
  await setBackgroundSync(db, 'did:plc:optedout', false)
  await recordLogin(db, { ...base, did: 'did:plc:local', spacesAllowed: false })
  await recordLogin(
    db,
    { ...base, did: 'did:plc:idle', spacesAllowed: true },
    new Date('2020-01-01T00:00:00Z'),
  )
  return db
}

describe('resolveSyncConfig', () => {
  it('fills in the defaults', () => {
    expect(resolveSyncConfig()).toEqual({
      safetyNet: { enabled: true, intervalMinutes: 15, activeWithinHours: 24 },
      discovery: { intervalMinutes: 60, activeWithinDays: 30 },
      allowUserOptOut: true,
    })
  })
})

describe('eligibleUsers', () => {
  const since = new Date(Date.now() - 86_400_000)

  it('includes active spaces users and skips opted-out, local, and idle ones', async () => {
    const db = await accounts()
    expect(await eligibleUsers(db, resolveSyncConfig(), since)).toEqual(['did:plc:active'])
  })

  it('includes users who opted out when the admin does not allow opting out', async () => {
    const db = await accounts()
    const users = await eligibleUsers(db, resolveSyncConfig({ allowUserOptOut: false }), since)
    expect(users.sort()).toEqual(['did:plc:active', 'did:plc:optedout'])
  })
})
