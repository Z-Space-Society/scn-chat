import type { ModelProvider } from '@scn-chat/plugin-api'
import { Hono } from 'hono'
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
  CredentialInputError,
  deleteCredential,
  listCredentials,
  saveCredential,
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

const newCredential = z.object({
  providerId: z.string().min(1),
  apiKey: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1), capabilities }))
    .min(1, 'Add at least one model'),
})

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

  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/models', async (c) => {
      const { did } = signedInUser(c)
      return c.json({
        models: await deps.catalog().listForUser(did),
        defaultModel: (await deps.catalog().defaultModelFor(did)) ?? null,
      })
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
      try {
        const models = await provider.listModels({
          apiKey: body.apiKey,
          baseURL: body.baseUrl,
          fetch: body.baseUrl && !provider.allowPrivateNetworks ? deps.guardedFetch : undefined,
        })
        return c.json({ models })
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
    })
    .get('/credentials', async (c) =>
      c.json({ credentials: await listCredentials(deps.db, signedInUser(c).did) }),
    )
    .post('/credentials', async (c) => {
      const body = await jsonBody(c, newCredential)
      const provider = userProvider(body.providerId)
      if (!provider)
        return c.json(
          { error: 'InvalidRequest', message: `Unknown provider ${body.providerId}` },
          400,
        )
      try {
        const credential = await saveCredential(deps.db, deps.box, signedInUser(c).did, provider, {
          apiKey: body.apiKey,
          name: body.name,
          slug: body.slug,
          baseUrl: body.baseUrl,
          models: body.models,
        })
        return c.json({ credential }, 201)
      } catch (err) {
        if (err instanceof CredentialInputError) {
          return c.json({ error: 'InvalidRequest', message: err.message }, 400)
        }
        throw err
      }
    })
    .delete('/credentials/:id', async (c) => {
      const deleted = await deleteCredential(deps.db, signedInUser(c).did, c.req.param('id'))
      return deleted ? c.json({ ok: true }) : c.json({ error: 'NotFound' }, 404)
    })
}
