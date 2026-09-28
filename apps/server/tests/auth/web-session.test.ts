import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import {
  createWebSession,
  deleteAllWebSessions,
  resolveWebSession,
  sweepExpired,
} from '../../src/auth/web-session.ts'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { dialects } from '../helpers/db.ts'

const DAY = 86_400_000

describe.each(dialects)('web sessions on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('resolves a new session token to its DID and stores only its hash', async () => {
    const db = await setup()
    const token = await createWebSession(db, 'did:plc:alice', 30)
    expect(await resolveWebSession(db, token, 30)).toEqual({ did: 'did:plc:alice', renewed: false })
    const { rows } = await sql<{ token_hash: string }>`select token_hash from web_session`.execute(
      db,
    )
    expect(rows[0]?.token_hash).not.toBe(token)
    await db.destroy()
  })

  it('rejects an expired session', async () => {
    const db = await setup()
    const start = new Date('2026-09-01T00:00:00Z')
    const token = await createWebSession(db, 'did:plc:alice', 30, start)
    expect(await resolveWebSession(db, token, 30, new Date(start.getTime() + 31 * DAY))).toBeNull()
    await db.destroy()
  })

  it('extends a session used in the second half of its life', async () => {
    const db = await setup()
    const start = new Date('2026-09-01T00:00:00Z')
    const token = await createWebSession(db, 'did:plc:alice', 30, start)
    expect(await resolveWebSession(db, token, 30, new Date(start.getTime() + 20 * DAY))).toEqual({
      did: 'did:plc:alice',
      renewed: true,
    })
    expect(
      await resolveWebSession(db, token, 30, new Date(start.getTime() + 45 * DAY)),
    ).toMatchObject({ did: 'did:plc:alice' })
    await db.destroy()
  })

  it('does not extend a session used in the first half of its life', async () => {
    const db = await setup()
    const start = new Date('2026-09-01T00:00:00Z')
    const token = await createWebSession(db, 'did:plc:alice', 30, start)
    await resolveWebSession(db, token, 30, new Date(start.getTime() + 5 * DAY))
    expect(await resolveWebSession(db, token, 30, new Date(start.getTime() + 31 * DAY))).toBeNull()
    await db.destroy()
  })

  it('sweeps expired sessions and abandoned sign-ins, keeping live ones', async () => {
    const db = await setup()
    const start = new Date('2026-09-01T00:00:00Z')
    const old = await createWebSession(db, 'did:plc:alice', 30, start)
    const live = await createWebSession(
      db,
      'did:plc:alice',
      30,
      new Date(start.getTime() + 20 * DAY),
    )
    await db
      .insertInto('oauth_state')
      .values([
        { key: 'abandoned', value: '{}', updated_at: start.toISOString() },
        {
          key: 'fresh',
          value: '{}',
          updated_at: new Date(start.getTime() + 31 * DAY).toISOString(),
        },
      ])
      .execute()
    const now = new Date(start.getTime() + 31 * DAY + 60_000)
    await sweepExpired(db, now)
    expect(await resolveWebSession(db, old, 30, now)).toBeNull()
    expect(await resolveWebSession(db, live, 30, now)).toMatchObject({ did: 'did:plc:alice' })
    const states = await db.selectFrom('oauth_state').select('key').execute()
    expect(states).toEqual([{ key: 'fresh' }])
    await db.destroy()
  })

  it('deletes every session for a user', async () => {
    const db = await setup()
    const a = await createWebSession(db, 'did:plc:alice', 30)
    const b = await createWebSession(db, 'did:plc:alice', 30)
    await deleteAllWebSessions(db, 'did:plc:alice')
    expect(await resolveWebSession(db, a, 30)).toBeNull()
    expect(await resolveWebSession(db, b, 30)).toBeNull()
    await db.destroy()
  })
})
