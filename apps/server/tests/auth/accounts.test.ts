import { describe, expect, it } from 'vitest'
import {
  getAccount,
  recordLogin,
  SpacesLostError,
  setBackgroundSync,
  touchActivity,
} from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const login = { did: 'did:plc:alice', handle: 'alice.test', pdsUrl: 'https://pds.test' }

describe.each(dialects)('accounts on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('gives a new account space storage when its scope allows spaces', async () => {
    const db = await setup()
    expect((await recordLogin(db, { ...login, spacesAllowed: true })).storageMode).toBe('space')
    await db.destroy()
  })

  it('gives a new account local storage when its scope lacks spaces', async () => {
    const db = await setup()
    expect((await recordLogin(db, { ...login, spacesAllowed: false })).storageMode).toBe('local')
    await db.destroy()
  })

  it('fails the login of a space account whose scope no longer allows spaces', async () => {
    const db = await setup()
    await recordLogin(db, { ...login, spacesAllowed: true })
    await expect(recordLogin(db, { ...login, spacesAllowed: false })).rejects.toBeInstanceOf(
      SpacesLostError,
    )
    await db.destroy()
  })

  it('keeps a local account local when its scope later allows spaces', async () => {
    const db = await setup()
    await recordLogin(db, { ...login, spacesAllowed: false })
    expect((await recordLogin(db, { ...login, spacesAllowed: true })).storageMode).toBe('local')
    await db.destroy()
  })

  it('updates the handle on each login', async () => {
    const db = await setup()
    await recordLogin(db, { ...login, spacesAllowed: true })
    await recordLogin(db, { ...login, handle: 'alice.new', spacesAllowed: true })
    expect((await getAccount(db, login.did))?.handle).toBe('alice.new')
    await db.destroy()
  })

  it('updates activity at most once a minute', async () => {
    const db = await setup()
    const start = new Date('2026-09-26T12:00:00Z')
    const account = await recordLogin(db, { ...login, spacesAllowed: true }, start)
    await touchActivity(db, account, new Date(start.getTime() + 30_000))
    expect((await getAccount(db, login.did))?.lastActiveAt).toBe(start.toISOString())
    await touchActivity(db, account, new Date(start.getTime() + 90_000))
    expect((await getAccount(db, login.did))?.lastActiveAt).toBe(
      new Date(start.getTime() + 90_000).toISOString(),
    )
    await db.destroy()
  })

  it('stores the background sync setting', async () => {
    const db = await setup()
    await recordLogin(db, { ...login, spacesAllowed: true })
    expect((await getAccount(db, login.did))?.backgroundSync).toBe(true)
    await setBackgroundSync(db, login.did, false)
    expect((await getAccount(db, login.did))?.backgroundSync).toBe(false)
    await db.destroy()
  })
})
