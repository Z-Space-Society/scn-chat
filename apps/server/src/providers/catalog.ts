import type { Capabilities, LanguageModelV4, ModelProvider, ModelRef } from '@scn-chat/plugin-api'
import type { Roles } from '../auth/roles.ts'
import type { ModelConfig } from '../config.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { Registry } from '../plugins/registry.ts'
import type { SecretBox } from '../secrets.ts'
import { credentialFor, listCredentials, USER_PROVIDER_PREFIX } from './user-credentials.ts'

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderConfigError'
  }
}

export class ModelUnavailable extends Error {
  readonly ref: ModelRef

  constructor(ref: ModelRef) {
    super(`Model ${ref.provider}/${ref.id} is not available to you`)
    this.name = 'ModelUnavailable'
    this.ref = ref
  }
}

export type ListedModel = {
  provider: string
  id: string
  name: string
  capabilities: Capabilities
  source: 'admin' | 'user'
  default: boolean
}

export type ResolvedModel = {
  ref: ModelRef
  provider: ModelProvider
  model: LanguageModelV4
  capabilities: Capabilities
}

/** Check the admin models against the registered providers and defined roles. */
export function validateAdminModels(
  models: ModelConfig[],
  registry: Registry<ModelProvider>,
  roles: Roles,
): ModelConfig[] {
  for (const model of models) {
    const name = `${model.provider}/${model.id}`
    const provider = registry.get(model.provider)
    if (!provider)
      throw new ProviderConfigError(
        `Admin model ${name} names provider "${model.provider}", which no plugin registered`,
      )
    if (!provider.hasAdminKey)
      throw new ProviderConfigError(
        `Admin model ${name} uses provider "${model.provider}", which has no admin key`,
      )
    if (!Array.isArray(model.roles) || model.roles.length === 0) {
      throw new ProviderConfigError(`Admin model ${name} must list the roles allowed to use it`)
    }
    const undefinedRole = model.roles.find((role) => !roles.defined.has(role))
    if (undefinedRole)
      throw new ProviderConfigError(`Admin model ${name} names undefined role "${undefinedRole}"`)
  }
  if (models.filter((model) => model.default).length > 1)
    throw new ProviderConfigError('More than one admin model is marked default')
  return models
}

export type CatalogDeps = {
  db: Db
  box: SecretBox
  providers: Registry<ModelProvider>
  adminModels: ModelConfig[]
  roles: Roles
  guardedFetch: typeof fetch
  logger: Logger
}

/** Which models a user can use, and how to reach them. */
export class ModelCatalog {
  private readonly deps: CatalogDeps

  constructor(deps: CatalogDeps) {
    this.deps = deps
  }

  private adminModelsFor(did: string): ModelConfig[] {
    const userRoles = new Set(this.deps.roles.rolesFor(did))
    return this.deps.adminModels.filter((model) => model.roles.some((role) => userRoles.has(role)))
  }

  defaultModel(): ModelRef | undefined {
    const model = this.deps.adminModels.find((m) => m.default)
    return model ? { provider: model.provider, id: model.id } : undefined
  }

  async listForUser(did: string): Promise<ListedModel[]> {
    const listed = new Map<string, ListedModel>()
    for (const model of this.adminModelsFor(did)) {
      listed.set(`${model.provider}/${model.id}`, {
        provider: model.provider,
        id: model.id,
        name: model.name,
        capabilities: model.capabilities,
        source: 'admin',
        default: Boolean(model.default),
      })
    }
    for (const credential of await listCredentials(this.deps.db, did)) {
      if (!this.deps.providers.get(credential.providerId)) {
        this.deps.logger.warn(
          { did, provider: credential.providerId },
          'a saved key is for a provider no plugin registers',
        )
        continue
      }
      for (const model of credential.models) {
        listed.set(`${credential.modelProvider}/${model.id}`, {
          provider: credential.modelProvider,
          id: model.id,
          name: model.name,
          capabilities: model.capabilities,
          source: 'user',
          default: false,
        })
      }
    }
    return [...listed.values()]
  }

  /** Resolve a model reference for a user: their own key first, then the admin key if their roles allow it. */
  async resolve(did: string, ref: ModelRef): Promise<ResolvedModel> {
    const own = await credentialFor(this.deps.db, this.deps.box, did, ref)
    if (own) {
      const provider = this.deps.providers.get(own.summary.providerId)
      if (!provider) throw new ModelUnavailable(ref)
      const endpoint = ref.provider.startsWith(USER_PROVIDER_PREFIX)
      const model = provider.createModel({
        modelId: ref.id,
        apiKey: own.apiKey,
        baseURL: own.summary.baseUrl ?? undefined,
        fetch: endpoint && !provider.allowPrivateNetworks ? this.deps.guardedFetch : undefined,
      })
      return { ref, provider, model, capabilities: own.info.capabilities }
    }
    const admin = this.adminModelsFor(did).find(
      (m) => m.provider === ref.provider && m.id === ref.id,
    )
    if (!admin) throw new ModelUnavailable(ref)
    const provider = this.deps.providers.get(admin.provider)
    if (!provider)
      throw new Error(`Admin model ${admin.provider}/${admin.id} has no registered provider`)
    return {
      ref,
      provider,
      model: provider.createModel({ modelId: ref.id }),
      capabilities: admin.capabilities,
    }
  }
}
