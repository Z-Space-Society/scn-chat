import type { ModelInfo } from '@scn-chat/plugin-api'
import { InvalidBody } from '../body.ts'
import type { Db } from '../db/index.ts'
import type { Logger } from '../logger.ts'
import { listAdminModels, servesAdminModels } from '../providers/admin-models.ts'
import type { SecretBox } from '../secrets.ts'
import { type LoadDeps, loadPlugins } from './host.ts'
import {
  type InstalledPlugin,
  type InstalledPlugins,
  optionsJsonSchema,
  secretKeys,
} from './installed.ts'
import { type PluginInstance, readInstances, writeInstances } from './instances.ts'
import {
  instantiate,
  PluginInstanceError,
  type PluginRuntime,
  type RuntimeBuilder,
  type RuntimeHolder,
} from './runtime.ts'

export type PluginAdminDeps = {
  db: Db
  box: SecretBox
  installed: InstalledPlugins
  holder: RuntimeHolder
  build: RuntimeBuilder
  /** For the scratch plugins that list a provider's models. */
  load: LoadDeps
  logger: Logger
}

export type InstanceChange = {
  options?: Record<string, unknown>
  clearSecrets?: string[]
  enabled?: boolean
}

export class InstanceNotFound extends Error {
  constructor(id: string) {
    super(`No plugin instance ${id}`)
    this.name = 'InstanceNotFound'
  }
}

const isBlank = (value: unknown) => value === undefined || value === null || value === ''

/** Split form input into stored options and secrets. A blank secret keeps the stored one. */
function splitOptions(
  installed: InstalledPlugin | undefined,
  input: Record<string, unknown>,
  stored: Record<string, unknown> = {},
  clear: string[] = [],
) {
  const keys = secretKeys(installed?.optionsSchema)
  const options = Object.fromEntries(
    Object.entries(input).filter(([key, value]) => !keys.includes(key) && !isBlank(value)),
  )
  const secrets: Record<string, unknown> = { ...stored }
  for (const key of keys) if (!isBlank(input[key])) secrets[key] = input[key]
  for (const key of clear) delete secrets[key]
  return { options, secrets }
}

const RANDOM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Rename instances still under the random IDs they were once added with to their plugin's ID. */
export async function nameInstancesAfterPlugins(
  db: Db,
  box: SecretBox,
  installed: InstalledPlugins,
  logger: Logger,
): Promise<void> {
  const instances = await readInstances(db, box)
  const taken = new Set(instances.map((instance) => instance.id))
  for (const instance of instances) {
    if (!RANDOM_ID.test(instance.id)) continue
    let id: string
    try {
      id = instantiate(installed, instance).id
    } catch (err) {
      if (!(err instanceof PluginInstanceError)) throw err
      logger.info(
        { instance: instance.id, err },
        "kept a plugin instance's random ID, since it doesn't load",
      )
      continue
    }
    if (taken.has(id)) {
      logger.info(
        { instance: instance.id, pluginId: id },
        "kept a plugin instance's random ID, since its plugin ID is taken",
      )
      continue
    }
    await db.updateTable('plugin_instance').set({ id }).where('id', '=', instance.id).execute()
    taken.delete(instance.id)
    taken.add(id)
    logger.info({ from: instance.id, to: id }, 'plugin instance renamed after its plugin')
  }
}

/** Adding, changing, and removing plugin instances, each applied without a restart. */
export class PluginAdmin {
  private readonly deps: PluginAdminDeps

  constructor(deps: PluginAdminDeps) {
    this.deps = deps
  }

  installed() {
    return [...this.deps.installed.values()].map((plugin) => ({
      package: plugin.package,
      description: plugin.description,
      version: plugin.version,
      schema: optionsJsonSchema(plugin),
      secretFields: secretKeys(plugin.optionsSchema),
      multiple: plugin.multiple,
    }))
  }

  /** Every instance with its form, options without secrets, and load status. */
  async list() {
    const statuses = this.deps.holder.current().statuses
    return (await readInstances(this.deps.db, this.deps.box)).map((instance) => {
      const installed = this.deps.installed.get(instance.package)
      const status = statuses.get(instance.id)
      return {
        id: instance.id,
        package: instance.package,
        enabled: instance.enabled,
        options: instance.options,
        secretFields: secretKeys(installed?.optionsSchema),
        secretsSet: Object.keys(instance.secrets),
        secretsUnreadable: Boolean(instance.unreadableSecrets),
        schema: installed ? optionsJsonSchema(installed) : null,
        pluginId: status?.state === 'loaded' ? status.pluginId : null,
        name: status?.state === 'loaded' ? status.name : null,
        providers:
          status?.state === 'loaded'
            ? this.deps.holder
                .current()
                .host.providers.list()
                .filter(
                  (provider) =>
                    this.deps.holder.current().host.providers.owner(provider.id) ===
                    status.pluginId,
                )
                .map((provider) => ({
                  id: provider.id,
                  name: provider.name,
                  hasAdminKey: provider.hasAdminKey,
                  listsModels: Boolean(provider.listModels),
                }))
            : [],
        status: status?.state ?? 'failed',
        error: status?.state === 'failed' ? status.error : null,
        issues: status?.state === 'failed' ? status.issues : [],
      }
    })
  }

  /** Add an instance, named after the plugin it makes. */
  async add(pkg: string, input: Record<string, unknown>, adminDid: string): Promise<string> {
    const installed = this.deps.installed.get(pkg)
    if (!installed) throw new InvalidBody(`The plugin package "${pkg}" isn't installed`)
    const draft = { id: 'new', package: pkg, enabled: true, ...splitOptions(installed, input) }
    let id: string
    try {
      id = instantiate(this.deps.installed, draft).id
    } catch (err) {
      if (err instanceof PluginInstanceError) throw new InvalidBody(err.message, err.issues)
      throw err
    }
    await this.change((instances) => {
      if (!installed.multiple && instances.some((instance) => instance.package === pkg))
        throw new InvalidBody(`${pkg} is already added, and can only be added once`)
      if (instances.some((instance) => instance.id === id))
        throw new InvalidBody(`An instance of the plugin ${id} is already added`)
      return { proposed: [...instances, { ...draft, id }], changedId: id }
    }, adminDid)
    return id
  }

  async update(id: string, change: InstanceChange, adminDid: string): Promise<void> {
    await this.change((instances) => {
      const index = instances.findIndex((instance) => instance.id === id)
      const instance = instances[index]
      if (!instance) throw new InstanceNotFound(id)
      const installed = this.deps.installed.get(instance.package)
      const split = splitOptions(
        installed,
        change.options ?? { ...instance.options },
        instance.secrets,
        change.clearSecrets,
      )
      const proposed = [...instances]
      proposed[index] = {
        ...instance,
        ...split,
        enabled: change.enabled ?? instance.enabled,
        // Clearing any secret discards the ones that can't be decrypted.
        unreadableSecrets: change.clearSecrets?.length ? undefined : instance.unreadableSecrets,
      }
      return { proposed, changedId: id }
    }, adminDid)
  }

  async remove(id: string, adminDid: string): Promise<void> {
    await this.change((instances) => {
      if (!instances.some((instance) => instance.id === id)) throw new InstanceNotFound(id)
      return { proposed: instances.filter((instance) => instance.id !== id) }
    }, adminDid)
  }

  async reorder(ids: string[], adminDid: string): Promise<void> {
    await this.change((instances) => {
      const byId = new Map(instances.map((instance) => [instance.id, instance]))
      if (
        ids.length !== instances.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !byId.has(id))
      )
        throw new InvalidBody('The new order must list every plugin instance once')
      return { proposed: ids.map((id) => byId.get(id) as PluginInstance) }
    }, adminDid)
  }

  /**
   * The models of the providers a plugin registers, using unsaved options from its form.
   * Blank secrets come from the stored instance.
   */
  async listModels(
    pkg: string,
    instanceId: string | undefined,
    input: Record<string, unknown>,
  ): Promise<(ModelInfo & { provider: string })[]> {
    const installed = this.deps.installed.get(pkg)
    if (!installed) throw new InvalidBody(`The plugin package "${pkg}" isn't installed`)
    const stored = instanceId
      ? (await readInstances(this.deps.db, this.deps.box)).find((i) => i.id === instanceId)
      : undefined
    const instance: PluginInstance = {
      id: instanceId ?? 'scratch',
      package: pkg,
      enabled: true,
      ...splitOptions(installed, input, stored?.secrets),
    }
    let plugin: ReturnType<typeof instantiate>
    try {
      plugin = instantiate(this.deps.installed, instance)
    } catch (err) {
      if (err instanceof PluginInstanceError) throw new InvalidBody(err.message, err.issues)
      throw err
    }
    const host = await loadPlugins([plugin], this.deps.load)
    try {
      const models: (ModelInfo & { provider: string })[] = []
      for (const provider of host.providers.list()) {
        if (!provider.listModels) continue
        for (const model of await provider.listModels({}))
          models.push({ ...model, provider: provider.id })
      }
      return models
    } finally {
      await host.close()
    }
  }

  /**
   * Read the instances under the lock, so changes never overwrite each other, then build a runtime
   * from the proposed ones and switch to it unless it breaks something.
   */
  private change(
    propose: (instances: PluginInstance[]) => { proposed: PluginInstance[]; changedId?: string },
    adminDid: string,
  ) {
    const { holder } = this.deps
    return holder.exclusive(async () => {
      const { proposed, changedId } = propose(await readInstances(this.deps.db, this.deps.box))
      const current = holder.current()
      const candidate = await this.deps.build(proposed)
      try {
        this.assertNothingBreaks(current, candidate, changedId)
        await this.assertModelsKeepProviders(current, candidate)
      } catch (err) {
        await candidate.host.close()
        throw err
      }
      await writeInstances(this.deps.db, this.deps.box, proposed, adminDid)
      holder.swap(candidate)
      this.deps.logger.info({ admin: adminDid, instance: changedId }, 'plugins changed')
    })
  }

  /** Refuse a change that fails the changed plugin, breaks a working one, or renames one. */
  private assertNothingBreaks(
    current: PluginRuntime,
    candidate: PluginRuntime,
    changedId: string | undefined,
  ) {
    for (const [id, status] of candidate.statuses) {
      const before = current.statuses.get(id)
      if (status.state === 'failed' && (id === changedId || before?.state === 'loaded'))
        throw new InvalidBody(status.error, id === changedId ? status.issues : [])
      if (
        status.state === 'loaded' &&
        before?.state === 'loaded' &&
        before.pluginId !== status.pluginId
      )
        throw new InvalidBody(
          `This change would rename the plugin from ${before.pluginId} to ${status.pluginId}. Add a new instance instead.`,
        )
    }
  }

  /** Refuse a change that leaves an admin model without the provider it had. */
  private async assertModelsKeepProviders(current: PluginRuntime, candidate: PluginRuntime) {
    const stranded = (await listAdminModels(this.deps.db)).filter(
      (model) =>
        servesAdminModels(current.host.providers, model.provider) &&
        !servesAdminModels(candidate.host.providers, model.provider),
    )
    if (stranded.length)
      throw new InvalidBody(
        `This change would leave these models without their provider: ${stranded
          .map((model) => `${model.provider}/${model.id}`)
          .join(', ')}. Remove them first.`,
      )
  }
}
