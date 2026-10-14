import type { ModelInfo, ModelProvider } from '@scn-chat/plugin-api'
import type { Db } from '../db/index.ts'
import type { SecretBox } from '../secrets.ts'
import { newTid } from '../storage/records.ts'

export const USER_PROVIDER_PREFIX = 'user:'
const SLUG_PATTERN = /^[a-z0-9-]+$/

export class CredentialInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CredentialInputError'
  }
}

/** A stored key no current or retired `SECRET_KEY` can decrypt, which the user must add again. */
export class UnreadableCredential extends Error {
  constructor(label: string) {
    super(
      `Your saved key for ${label} can't be read anymore. Add it again under Settings, API keys.`,
    )
    this.name = 'UnreadableCredential'
  }
}

export type CredentialSummary = {
  id: string
  providerId: string
  /** The provider value model references use: the provider ID, or user:<slug> for a user endpoint. */
  modelProvider: string
  name: string | null
  slug: string | null
  baseUrl: string | null
  keyHint: string
  /** The stored key can't be decrypted, and must be added again. */
  keyUnreadable: boolean
  models: ModelInfo[]
}

type Row = {
  id: string
  provider_id: string
  name: string | null
  slug: string | null
  base_url: string | null
  key_hint: string
  models_json: string
  api_key_encrypted: string
}

const summarize = (row: Row, box: SecretBox): CredentialSummary => ({
  id: row.id,
  providerId: row.provider_id,
  modelProvider: row.slug ? `${USER_PROVIDER_PREFIX}${row.slug}` : row.provider_id,
  name: row.name,
  slug: row.slug,
  baseUrl: row.base_url,
  keyHint: row.key_hint,
  keyUnreadable: !box.hasKeyFor(row.api_key_encrypted),
  models: JSON.parse(row.models_json) as ModelInfo[],
})

async function rows(db: Db, did: string): Promise<Row[]> {
  return db
    .selectFrom('provider_credential')
    .select([
      'id',
      'provider_id',
      'name',
      'slug',
      'base_url',
      'key_hint',
      'models_json',
      'api_key_encrypted',
    ])
    .where('owner_did', '=', did)
    .orderBy('created_at')
    .execute()
}

export async function listCredentials(
  db: Db,
  box: SecretBox,
  did: string,
): Promise<CredentialSummary[]> {
  return (await rows(db, did)).map((row) => summarize(row, box))
}

export type NewCredential = {
  apiKey: string
  name?: string
  slug?: string
  baseUrl?: string
  models: ModelInfo[]
}

/** Store a user's key for a provider, replacing their earlier key unless it is a separate endpoint. */
export async function saveCredential(
  db: Db,
  box: SecretBox,
  did: string,
  provider: ModelProvider,
  input: NewCredential,
): Promise<CredentialSummary> {
  if (!provider.userKeys)
    throw new CredentialInputError(`${provider.name} does not accept user keys`)
  if (!input.apiKey.trim()) throw new CredentialInputError('An API key is required')
  const endpoint = Boolean(input.baseUrl)
  if (endpoint && !provider.userEndpoints)
    throw new CredentialInputError(`${provider.name} does not accept user endpoints`)
  if (endpoint && !(input.slug && SLUG_PATTERN.test(input.slug))) {
    throw new CredentialInputError(`An endpoint needs a slug matching ${SLUG_PATTERN}`)
  }
  if (endpoint && !URL.canParse(input.baseUrl as string))
    throw new CredentialInputError('The base URL is not a valid URL')
  const existing = await rows(db, did)
  if (endpoint && existing.some((row) => row.slug === input.slug)) {
    throw new CredentialInputError(`You already have an endpoint named "${input.slug}"`)
  }
  const now = new Date().toISOString()
  const row = {
    provider_id: provider.id,
    name: input.name ?? null,
    slug: endpoint ? (input.slug as string) : null,
    base_url: endpoint ? (input.baseUrl as string) : null,
    api_key_encrypted: box.encrypt(input.apiKey),
    key_hint: input.apiKey.slice(-4),
    models_json: JSON.stringify(input.models),
    updated_at: now,
  }
  const replace = endpoint
    ? undefined
    : existing.find((r) => r.provider_id === provider.id && !r.slug)
  if (replace) {
    await db.updateTable('provider_credential').set(row).where('id', '=', replace.id).execute()
    return summarize({ ...replace, ...row }, box)
  }
  const id = newTid()
  await db
    .insertInto('provider_credential')
    .values({ id, owner_did: did, created_at: now, ...row })
    .execute()
  return summarize({ id, ...row }, box)
}

/** Replace the models a user's key covers, such as to say what each can do, leaving the key itself. */
export async function updateCredentialModels(
  db: Db,
  box: SecretBox,
  did: string,
  id: string,
  models: ModelInfo[],
): Promise<CredentialSummary | undefined> {
  if (!models.length) throw new CredentialInputError('Add at least one model')
  const ids = new Set(models.map((model) => model.id))
  if (ids.size < models.length) throw new CredentialInputError('Each model can be listed once')
  const row = (await rows(db, did)).find((r) => r.id === id)
  if (!row) return undefined
  const models_json = JSON.stringify(models)
  await db
    .updateTable('provider_credential')
    .set({ models_json, updated_at: new Date().toISOString() })
    .where('owner_did', '=', did)
    .where('id', '=', id)
    .execute()
  return summarize({ ...row, models_json }, box)
}

export async function deleteCredential(db: Db, did: string, id: string): Promise<boolean> {
  const result = await db
    .deleteFrom('provider_credential')
    .where('owner_did', '=', did)
    .where('id', '=', id)
    .executeTakeFirst()
  return Number(result.numDeletedRows) > 0
}

/** The user's credential that covers a model reference, with its decrypted key. */
export async function credentialFor(
  db: Db,
  box: SecretBox,
  did: string,
  ref: { provider: string; id: string },
) {
  const all = await rows(db, did)
  const row = ref.provider.startsWith(USER_PROVIDER_PREFIX)
    ? all.find((r) => r.slug === ref.provider.slice(USER_PROVIDER_PREFIX.length))
    : all.find((r) => r.provider_id === ref.provider && !r.slug)
  if (!row) return undefined
  const summary = summarize(row, box)
  const info = summary.models.find((model) => model.id === ref.id)
  if (!info) return undefined
  const apiKey = box.tryDecrypt(row.api_key_encrypted)
  if (apiKey === undefined)
    throw new UnreadableCredential(summary.name ?? summary.slug ?? summary.providerId)
  return { summary, info, apiKey }
}
