import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { Roles } from '../auth/roles.ts'
import { signedInUser } from '../auth/routes.ts'
import { InvalidBody, jsonBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { AppEnv } from '../env.ts'
import type { Logger } from '../logger.ts'
import { InstanceNotFound, type PluginAdmin } from '../plugins/admin.ts'
import type { PluginRuntime } from '../plugins/runtime.ts'
import {
  adminModelIssues,
  adminModelSchema,
  deleteAdminModel,
  listAdminModels,
  reorderAdminModels,
  saveAdminModel,
  servesAdminModels,
} from '../providers/admin-models.ts'
import { safeErrorMessage } from '../safe-error.ts'
import { jsonObject } from '../schemas.ts'

export type PluginAdminRoutesDeps = {
  db: Db
  roles: Roles
  plugins: PluginAdmin
  runtime: () => PluginRuntime
  logger: Logger
}

const modelRefs = z.array(z.object({ provider: z.string().min(1), id: z.string().min(1) }))

const notFound = { error: 'NotFound', message: 'Plugin instance not found' } as const

/** Plugin instances and admin models, for admins. */
export function pluginAdminRoutes(deps: PluginAdminRoutesDeps) {
  const found = async <T>(work: () => Promise<T>) => {
    try {
      return { ok: true as const, value: await work() }
    } catch (err) {
      if (err instanceof InstanceNotFound) return { ok: false as const }
      throw err
    }
  }

  /** Read a model from the body and check it against the loaded providers and existing roles. */
  const checkedModel = async (c: Context) => {
    const model = await jsonBody(c, adminModelSchema)
    const issues = adminModelIssues(model, deps.runtime().host.providers, await deps.roles.names())
    if (issues.length)
      throw new InvalidBody(issues.map((issue) => issue.message).join('; '), issues)
    return model
  }

  const modelExists = async (provider: string, id: string) =>
    (await listAdminModels(deps.db)).some((m) => m.provider === provider && m.id === id)

  return new Hono<AppEnv>()
    .get('/plugins/installed', (c) => c.json({ plugins: deps.plugins.installed() }))
    .get('/plugins', async (c) => c.json({ instances: await deps.plugins.list() }))
    .post('/plugins', async (c) => {
      const body = await jsonBody(
        c,
        z.object({ package: z.string().min(1), options: jsonObject.default({}) }),
      )
      const id = await deps.plugins.add(body.package, body.options, signedInUser(c).did)
      return c.json({ id }, 201)
    })
    .post('/plugins/list-models', async (c) => {
      const body = await jsonBody(
        c,
        z.object({
          package: z.string().min(1),
          instanceId: z.string().optional(),
          options: jsonObject.default({}),
        }),
      )
      try {
        return c.json({
          models: await deps.plugins.listModels(body.package, body.instanceId, body.options),
        })
      } catch (err) {
        if (err instanceof InvalidBody) throw err
        deps.logger.warn({ err, package: body.package }, 'listing models for an admin failed')
        return c.json({ error: 'UpstreamFailure', message: safeErrorMessage(err) }, 502)
      }
    })
    .put('/plugins/order', async (c) => {
      const body = await jsonBody(c, z.object({ ids: z.array(z.string()) }))
      await deps.plugins.reorder(body.ids, signedInUser(c).did)
      return c.json({ ok: true })
    })
    .put('/plugins/:id', async (c) => {
      const body = await jsonBody(
        c,
        z.object({
          options: jsonObject.optional(),
          clearSecrets: z.array(z.string()).optional(),
          enabled: z.boolean().optional(),
        }),
      )
      const result = await found(() =>
        deps.plugins.update(c.req.param('id'), body, signedInUser(c).did),
      )
      return result.ok ? c.json({ ok: true }) : c.json(notFound, 404)
    })
    .delete('/plugins/:id', async (c) => {
      const result = await found(() => deps.plugins.remove(c.req.param('id'), signedInUser(c).did))
      return result.ok ? c.json({ ok: true }) : c.json(notFound, 404)
    })
    .get('/models', async (c) => {
      const providers = deps.runtime().host.providers
      const models = (await listAdminModels(deps.db)).map((model) => ({
        ...model,
        warning: servesAdminModels(providers, model.provider)
          ? null
          : `Provider "${model.provider}" isn't loaded with an admin key, so users can't use this model.`,
      }))
      return c.json({ models })
    })
    .post('/models', async (c) => {
      const model = await checkedModel(c)
      if (await modelExists(model.provider, model.id))
        throw new InvalidBody(`${model.provider}/${model.id} is already an admin model`, [
          { path: ['id'], message: 'already exists' },
        ])
      await saveAdminModel(deps.db, model, signedInUser(c).did)
      return c.json({ ok: true }, 201)
    })
    .put('/models', async (c) => {
      const model = await checkedModel(c)
      if (!(await modelExists(model.provider, model.id)))
        return c.json({ error: 'NotFound', message: 'Model not found' }, 404)
      await saveAdminModel(deps.db, model, signedInUser(c).did)
      return c.json({ ok: true })
    })
    .delete('/models', async (c) => {
      const ref = await jsonBody(c, z.object({ provider: z.string(), id: z.string() }))
      if (!(await deleteAdminModel(deps.db, ref.provider, ref.id)))
        return c.json({ error: 'NotFound', message: 'Model not found' }, 404)
      deps.logger.info({ admin: signedInUser(c).did, model: ref }, 'admin model removed')
      return c.json({ ok: true })
    })
    .put('/models/order', async (c) => {
      const body = await jsonBody(c, z.object({ models: modelRefs }))
      await reorderAdminModels(deps.db, body.models)
      return c.json({ ok: true })
    })
}
