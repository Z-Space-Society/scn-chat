import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import { type PluginInstance, readInstances, writeInstances } from '../../src/plugins/instances.ts'
import { SecretBox } from '../../src/secrets.ts'
import { dialects } from '../helpers/db.ts'

const oldKey = Buffer.alloc(32, 3)
const box = new SecretBox(oldKey)
/** The same server after its `SECRET_KEY` was replaced and the old one lost. */
const newBox = new SecretBox(Buffer.alloc(32, 4))
const admin = 'did:plc:admin'

const instance = (id: string, secrets: Record<string, unknown> = {}): PluginInstance => ({
  id,
  package: 'provider-plugin',
  enabled: true,
  options: { id },
  secrets,
})

describe.each(dialects)('plugin instances on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('reads secrets no key can decrypt as unset rather than failing', async () => {
    const db = await setup()
    await writeInstances(db, box, [instance('a', { apiKey: 'sk-a' }), instance('b')], admin)
    const [a, b] = await readInstances(db, newBox)
    expect(a).toMatchObject({ id: 'a', secrets: {}, unreadableSecrets: expect.any(String) })
    expect(b?.unreadableSecrets).toBeUndefined()
    await db.destroy()
  })

  it('writes unreadable secrets back until an admin enters new ones', async () => {
    const db = await setup()
    await writeInstances(db, box, [instance('a', { apiKey: 'sk-a' })], admin)
    await writeInstances(db, newBox, await readInstances(db, newBox), admin)
    const restored = new SecretBox(Buffer.alloc(32, 4), [oldKey])
    expect((await readInstances(db, restored))[0]?.secrets).toEqual({ apiKey: 'sk-a' })
    const [a] = await readInstances(db, newBox)
    await writeInstances(
      db,
      newBox,
      [{ ...(a as PluginInstance), secrets: { apiKey: 'sk-new' } }],
      admin,
    )
    expect(await readInstances(db, newBox)).toEqual([instance('a', { apiKey: 'sk-new' })])
    await db.destroy()
  })
})
