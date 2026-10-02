import pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordLogin, setBackgroundSync } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { settingSchemas } from '../../src/settings/schemas.ts'
import type { SyncEngine } from '../../src/sync/engine.ts'
import { eligibleUsers, type SyncSettings, startSyncScheduler } from '../../src/sync/scheduler.ts'
import { createSqliteDb } from '../helpers/db.ts'

const defaults = () => settingSchemas.sync.parse({})
const everyone = async () => true

async function accounts() {
  const db = createSqliteDb()
  await migrateToLatest(db)
  const base = { handle: null, pdsUrl: 'https://pds.test' }
  await recordLogin(db, { ...base, did: 'did:plc:active', spacesAllowed: true })
  await recordLogin(db, { ...base, did: 'did:plc:optedout', spacesAllowed: true })
  await setBackgroundSync(db, 'did:plc:optedout', false)
  await recordLogin(db, { ...base, did: 'did:plc:local', spacesAllowed: false })
  await recordLogin(db, { ...base, did: 'did:plc:viewer', spacesAllowed: true, viewer: true })
  await recordLogin(
    db,
    { ...base, did: 'did:plc:idle', spacesAllowed: true },
    new Date('2020-01-01T00:00:00Z'),
  )
  return db
}

afterEach(() => vi.useRealTimers())

describe('eligibleUsers', () => {
  const since = new Date(Date.now() - 86_400_000)

  it('includes active spaces users and skips opted-out, local, viewer, and idle ones', async () => {
    const db = await accounts()
    expect(await eligibleUsers(db, defaults(), since, everyone)).toEqual(['did:plc:active'])
  })

  it('includes users who opted out when the admin does not allow opting out', async () => {
    const db = await accounts()
    const config = settingSchemas.sync.parse({ allowUserOptOut: false })
    const users = await eligibleUsers(db, config, since, everyone)
    expect(users.sort()).toEqual(['did:plc:active', 'did:plc:optedout'])
  })

  it('skips users without access', async () => {
    const db = await accounts()
    expect(await eligibleUsers(db, defaults(), since, async () => false)).toEqual([])
  })
})

describe('startSyncScheduler', () => {
  it('restarts its timers with new intervals when the sync settings change', async () => {
    vi.useFakeTimers()
    const db = await accounts()
    let sync: SyncSettings = settingSchemas.sync.parse({ discovery: { intervalMinutes: 60 } })
    let changed = () => {}
    const engine = {
      renewRegistrations: vi.fn(async () => {}),
      safetyNet: vi.fn(async () => {}),
      discover: vi.fn(async () => {}),
    }
    const stop = startSyncScheduler({
      engine: engine as unknown as SyncEngine,
      db,
      sync: () => sync,
      onSyncChange: (listener) => {
        changed = listener
        return () => {}
      },
      hasAccess: everyone,
      logger: pino({ level: 'silent' }),
    })
    sync = settingSchemas.sync.parse({ discovery: { intervalMinutes: 1 } })
    changed()
    await vi.advanceTimersByTimeAsync(61_000)
    expect(engine.discover).toHaveBeenCalledWith('did:plc:active')
    stop()
  })
})
