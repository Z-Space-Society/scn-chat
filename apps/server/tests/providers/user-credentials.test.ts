import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import {
  CredentialInputError,
  credentialFor,
  deleteCredential,
  listCredentials,
  saveCredential,
} from '../../src/providers/user-credentials.ts'
import { SecretBox } from '../../src/secrets.ts'
import { dialects } from '../helpers/db.ts'
import { fakeProvider } from '../helpers/providers.ts'

const caps = { vision: false, reasoning: false, tools: false }
const box = new SecretBox(Buffer.alloc(32, 5))
const did = 'did:plc:alice'

describe.each(dialects)('user credentials on $name', ({ create }) => {
  const setup = async () => {
    const db = create()
    await migrateToLatest(db)
    return db
  }

  it('stores the key encrypted and lists only its last four characters', async () => {
    const db = await setup()
    await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'sk-live-abcd1234',
      models: [],
    })
    const [credential] = await listCredentials(db, did)
    expect(credential).toMatchObject({ providerId: 'fake', modelProvider: 'fake', keyHint: '1234' })
    expect(JSON.stringify(credential)).not.toContain('sk-live')
    const row = await db
      .selectFrom('provider_credential')
      .select('api_key_encrypted')
      .executeTakeFirstOrThrow()
    expect(row.api_key_encrypted).not.toContain('sk-live')
    await db.destroy()
  })

  it('replaces the earlier key for the same provider', async () => {
    const db = await setup()
    const { provider } = fakeProvider()
    await saveCredential(db, box, did, provider, { apiKey: 'old-key-1111', models: [] })
    await saveCredential(db, box, did, provider, { apiKey: 'new-key-2222', models: [] })
    expect((await listCredentials(db, did)).map((c) => c.keyHint)).toEqual(['2222'])
    await db.destroy()
  })

  it('refuses a key for a provider that does not accept user keys', async () => {
    const db = await setup()
    const { provider } = fakeProvider({ userKeys: false })
    await expect(
      saveCredential(db, box, did, provider, { apiKey: 'k', models: [] }),
    ).rejects.toBeInstanceOf(CredentialInputError)
    await db.destroy()
  })

  it('requires user endpoints to be allowed and to have a valid, unique slug', async () => {
    const db = await setup()
    const endpoint = { apiKey: 'k', baseUrl: 'https://x.example/v1', models: [] }
    await expect(
      saveCredential(db, box, did, fakeProvider().provider, { ...endpoint, slug: 'x' }),
    ).rejects.toThrow(/user endpoints/)
    const { provider } = fakeProvider({ userEndpoints: true })
    await expect(
      saveCredential(db, box, did, provider, { ...endpoint, slug: 'Bad Slug' }),
    ).rejects.toThrow(/slug/)
    const saved = await saveCredential(db, box, did, provider, { ...endpoint, slug: 'mine' })
    expect(saved.modelProvider).toBe('user:mine')
    await expect(
      saveCredential(db, box, did, provider, { ...endpoint, slug: 'mine' }),
    ).rejects.toThrow(/already/)
    await db.destroy()
  })

  it('finds the credential covering a model reference, with its decrypted key', async () => {
    const db = await setup()
    await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'sk-9',
      models: [{ id: 'm', name: 'M', capabilities: caps }],
    })
    expect((await credentialFor(db, box, did, { provider: 'fake', id: 'm' }))?.apiKey).toBe('sk-9')
    expect(await credentialFor(db, box, did, { provider: 'fake', id: 'other' })).toBeUndefined()
    await db.destroy()
  })

  it('deletes only the owner credential', async () => {
    const db = await setup()
    const saved = await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'k',
      models: [],
    })
    expect(await deleteCredential(db, 'did:plc:bob', saved.id)).toBe(false)
    expect(await deleteCredential(db, did, saved.id)).toBe(true)
    expect(await listCredentials(db, did)).toEqual([])
    await db.destroy()
  })
})
