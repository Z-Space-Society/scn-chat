import { describe, expect, it } from 'vitest'
import { getAccount, recordLogin, SpacesLostError, touchActivity } from '../../src/auth/accounts.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const login = { did: 'did:plc:alice', handle: 'alice.test', pdsUrl: 'https://pds.test' }

describe.each(dialects)('accounts on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('gives a new account space storage only when its scope allows spaces', async () => {
    const db = await setup()
    expect((await recordLogin(db, { ...login, spacesAllowed: true })).storageMode).toBe('space')
    const bob = { ...login, did: 'did:plc:bob', spacesAllowed: false }
    expect((await recordLogin(db, bob)).storageMode).toBe('local')
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
})
