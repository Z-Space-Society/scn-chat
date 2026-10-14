import { describe, expect, it } from 'vitest'
import { migrateToLatest } from '../../src/db/migrate.ts'
import {
  CredentialInputError,
  credentialFor,
  deleteCredential,
  listCredentials,
  saveCredential,
  UnreadableCredential,
  updateCredentialModels,
} from '../../src/providers/user-credentials.ts'
import { SecretBox } from '../../src/secrets.ts'
import { dialects } from '../helpers/db.ts'
import { fakeProvider } from '../helpers/providers.ts'

const caps = { vision: false, reasoning: false, tools: false }
const model = { id: 'm', name: 'M', capabilities: caps }
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
      models: [model],
    })
    const [credential] = await listCredentials(db, box, did)
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
    await saveCredential(db, box, did, provider, { apiKey: 'old-key-1111', models: [model] })
    await saveCredential(db, box, did, provider, { apiKey: 'new-key-2222', models: [model] })
    expect((await listCredentials(db, box, did)).map((c) => c.keyHint)).toEqual(['2222'])
    await db.destroy()
  })

  it('refuses a key for a provider that does not accept user keys', async () => {
    const db = await setup()
    const { provider } = fakeProvider({ userKeys: false })
    await expect(
      saveCredential(db, box, did, provider, { apiKey: 'k', models: [model] }),
    ).rejects.toBeInstanceOf(CredentialInputError)
    await db.destroy()
  })

  it('requires user endpoints to be allowed and to have a valid, unique slug', async () => {
    const db = await setup()
    const endpoint = { apiKey: 'k', baseUrl: 'https://x.example/v1', models: [model] }
    await expect(
      saveCredential(db, box, did, fakeProvider().provider, { ...endpoint, slug: 'x' }),
    ).rejects.toBeInstanceOf(CredentialInputError)
    const { provider } = fakeProvider({ userEndpoints: true })
    await expect(
      saveCredential(db, box, did, provider, { ...endpoint, slug: 'Bad Slug' }),
    ).rejects.toBeInstanceOf(CredentialInputError)
    const saved = await saveCredential(db, box, did, provider, { ...endpoint, slug: 'mine' })
    expect(saved.modelProvider).toBe('user:mine')
    await expect(
      saveCredential(db, box, did, provider, { ...endpoint, slug: 'mine' }),
    ).rejects.toBeInstanceOf(CredentialInputError)
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

  it('flags a key no current or retired key can decrypt, and refuses to use it', async () => {
    const db = await setup()
    await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'sk-live-abcd1234',
      models: [{ id: 'm1', name: 'M1', capabilities: caps }],
    })
    const lost = new SecretBox(Buffer.alloc(32, 6))
    expect((await listCredentials(db, box, did))[0]?.keyUnreadable).toBe(false)
    expect((await listCredentials(db, lost, did))[0]?.keyUnreadable).toBe(true)
    await expect(
      credentialFor(db, lost, did, { provider: 'fake', id: 'm1' }),
    ).rejects.toBeInstanceOf(UnreadableCredential)
    await db.destroy()
  })

  it("changes only the owner's credential's models, keeping its key", async () => {
    const db = await setup()
    const saved = await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'sk-1111',
      models: [{ id: 'm1', name: 'M1', capabilities: caps }],
    })
    const on = { vision: false, reasoning: true, tools: true }
    const models = [{ id: 'm1', name: 'M1', capabilities: on }]
    expect(await updateCredentialModels(db, box, 'did:plc:bob', saved.id, models)).toBeUndefined()
    expect(await updateCredentialModels(db, box, did, saved.id, models)).toMatchObject({
      keyHint: '1111',
      models,
    })
    const found = await credentialFor(db, box, did, { provider: 'fake', id: 'm1' })
    expect(found).toMatchObject({ apiKey: 'sk-1111', info: { capabilities: on } })
    await db.destroy()
  })

  it('deletes only the owner credential', async () => {
    const db = await setup()
    const saved = await saveCredential(db, box, did, fakeProvider().provider, {
      apiKey: 'k',
      models: [model],
    })
    expect(await deleteCredential(db, 'did:plc:bob', saved.id)).toBe(false)
    expect(await deleteCredential(db, did, saved.id)).toBe(true)
    expect(await listCredentials(db, box, did)).toEqual([])
    await db.destroy()
  })
})
