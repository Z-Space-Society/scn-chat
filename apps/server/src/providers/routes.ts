import type { ModelProvider } from '@scn-chat/plugin-api'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { requireUser, signedInUser } from '../auth/routes.ts'
import { jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'
import type { Registry } from '../plugins/registry.ts'
import type { SecretBox } from '../secrets.ts'
import type { ModelCatalog } from './catalog.ts'
import {
  credentialById,
  deleteCredential,
  listCredentials,
  saveCredential,
  updateCredentialModels,
} from './user-credentials.ts'

export type ProviderRoutesDeps = {
  db: Db
  box: SecretBox
  /** The current plugin runtime's catalog and providers. */
  catalog: () => ModelCatalog
  providers: () => Registry<ModelProvider>
  guardedFetch: typeof fetch
  logger: Logger
}

const capabilities = z.object({ vision: z.boolean(), reasoning: z.boolean(), tools: z.boolean() })

// The store refuses an empty list or a model listed twice, for every way a credential is saved.
const credentialModels = z.array(
  z.object({ id: z.string().min(1), name: z.string().min(1), capabilities }),
)

const newCredential = z.object({
  providerId: z.string().min(1),
  apiKey: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  baseUrl: z.string().optional(),
  models: credentialModels,
})

const credentialChange = z.object({ models: credentialModels })

const listModelsRequest = z.object({
  apiKey: z.string().min(1, 'An API key is required'),
  baseUrl: z.string().optional(),
})

/** Models, providers that accept user keys, and the user's own credentials. */
export function providerRoutes(deps: ProviderRoutesDeps) {
  const userProvider = (id: string) => {
    const provider = deps.providers().get(id)
    return provider?.userKeys ? provider : undefined
  }
  /** A provider's models for a user's key, through the guarded fetch when it is the user's endpoint. */
  const listModelsFor = async (
    c: Context<AppEnv>,
    provider: ModelProvider,
    key: { apiKey: string; baseUrl?: string },
  ) => {
    if (!provider.listModels) return c.json({ error: 'NotFound' }, 404)
    try {
      const models = await provider.listModels({
        apiKey: key.apiKey,
        baseURL: key.baseUrl,
        fetch: key.baseUrl && !provider.allowPrivateNetworks ? deps.guardedFetch : undefined,
      })
      return c.json({ models }, 200)
    } catch (err) {
      deps.logger.warn({ err, provider: provider.id }, 'listing models failed')
      return c.json(
        {
          error: 'UpstreamFailure',
          message: err instanceof Error ? err.message : 'Listing models failed',
        },
        502,
      )
    }
  }

  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/models', async (c) => {
      const { did } = signedInUser(c)
      const { models, defaultModel } = await deps.catalog().modelsFor(did)
      return c.json({ models, defaultModel: defaultModel ?? null })
    })
    .get('/providers', (c) =>
      c.json({
        providers: deps
          .providers()
          .list()
          .filter((provider) => provider.userKeys)
          .map((provider) => ({
            id: provider.id,
            name: provider.name,
            userEndpoints: Boolean(provider.userEndpoints),
            listsModels: Boolean(provider.listModels),
          })),
      }),
    )
    .post('/providers/:id/list-models', async (c) => {
      const provider = userProvider(c.req.param('id'))
      if (!provider?.listModels) return c.json({ error: 'NotFound' }, 404)
      const body = await jsonBody(c, listModelsRequest)
      if (body.baseUrl && !provider.userEndpoints)
        return c.json({ error: 'InvalidRequest', message: 'No user endpoints' }, 400)
      return listModelsFor(c, provider, body)
    })
    .get('/credentials', async (c) =>
      c.json({ credentials: await listCredentials(deps.db, deps.box, signedInUser(c).did) }),
    )
    .post('/credentials', async (c) => {
      const body = await jsonBody(c, newCredential)
      const provider = userProvider(body.providerId)
      if (!provider)
        return c.json(
          { error: 'InvalidRequest', message: `Unknown provider ${body.providerId}` },
          400,
        )
      const credential = await saveCredential(deps.db, deps.box, signedInUser(c).did, provider, {
        apiKey: body.apiKey,
        name: body.name,
        slug: body.slug,
        baseUrl: body.baseUrl,
        models: body.models,
      })
      return c.json({ credential }, 201)
    })
    .post('/credentials/:id/list-models', async (c) => {
      const stored = await credentialById(deps.db, deps.box, signedInUser(c).did, c.req.param('id'))
      const provider = stored && userProvider(stored.summary.providerId)
      if (!stored || !provider) return c.json({ error: 'NotFound' }, 404)
      return listModelsFor(c, provider, {
        apiKey: stored.apiKey,
        baseUrl: stored.summary.baseUrl ?? undefined,
      })
    })
    .patch('/credentials/:id', async (c) => {
      const body = await jsonBody(c, credentialChange)
      const credential = await updateCredentialModels(
        deps.db,
        deps.box,
        signedInUser(c).did,
        c.req.param('id'),
        body.models,
      )
      return credential ? c.json({ credential }) : c.json({ error: 'NotFound' }, 404)
    })
    .delete('/credentials/:id', async (c) => {
      const deleted = await deleteCredential(deps.db, signedInUser(c).did, c.req.param('id'))
      return deleted ? c.json({ ok: true }) : c.json({ error: 'NotFound' }, 404)
    })
}
