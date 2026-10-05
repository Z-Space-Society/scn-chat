import type { Capabilities, LanguageModelV4, ModelProvider, ModelRef } from '@scn-chat/plugin-api'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import type { Registry } from '../plugins/registry.ts'
import type { SecretBox } from '../secrets.ts'
import { type AdminModel, listAdminModels, servesAdminModels } from './admin-models.ts'
import { credentialFor, listCredentials, USER_PROVIDER_PREFIX } from './user-credentials.ts'

export class ModelUnavailable extends Error {
  readonly ref: ModelRef

  constructor(ref: ModelRef) {
    super('This model is not available. Choose another model.')
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

export type CatalogDeps = {
  db: Db
  box: SecretBox
  providers: Registry<ModelProvider>
  /** The user's roles, which decide the admin models they may use. */
  rolesOf: (did: string) => Promise<string[]>
  guardedFetch: typeof fetch
  logger: Logger
}

/** Which models a user can use, and how to reach them. */
export class ModelCatalog {
  private readonly deps: CatalogDeps

  constructor(deps: CatalogDeps) {
    this.deps = deps
  }

  /** Admin models whose provider is loaded with an admin key. */
  private async availableAdminModels(): Promise<AdminModel[]> {
    return (await listAdminModels(this.deps.db)).filter((model) =>
      servesAdminModels(this.deps.providers, model.provider),
    )
  }

  private async adminModelsFor(did: string): Promise<AdminModel[]> {
    const userRoles = new Set(await this.deps.rolesOf(did))
    return (await this.availableAdminModels()).filter((model) =>
      model.roles.some((role) => userRoles.has(role)),
    )
  }

  /** The admin default, when the user's roles allow it. */
  async defaultModelFor(did: string): Promise<ModelRef | undefined> {
    const model = (await this.adminModelsFor(did)).find((m) => m.default)
    return model ? { provider: model.provider, id: model.id } : undefined
  }

  async listForUser(did: string): Promise<ListedModel[]> {
    const listed = new Map<string, ListedModel>()
    for (const model of await this.adminModelsFor(did)) {
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
    const admin = (await this.adminModelsFor(did)).find(
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
