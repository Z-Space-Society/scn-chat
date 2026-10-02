import {
  type GenerateTextRequest,
  type HookHandler,
  type HookName,
  type HookOrder,
  type InfoPatch,
  type Ingester,
  type Logger,
  type ModelProvider,
  PLUGIN_API_VERSION,
  type Plugin,
  type PluginContext,
  type RoleSource,
  type Tool,
  type ToolSource,
} from '@scn-chat/plugin-api'
import { HookRunner } from './hooks.ts'
import { IngesterRegistry, Registry } from './registry.ts'

export class PluginLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PluginLoadError'
  }
}

/** The app services that plugins can call. */
export type PluginServices = {
  generateText(request: GenerateTextRequest): Promise<{ text: string; finishReason: string }>
  updateInfo(
    user: string,
    conversation: string,
    patch: InfoPatch,
    options?: { unlessUserTitled?: boolean },
  ): Promise<void>
  userSettings(plugin: Plugin, user: string): Promise<unknown>
  /** Suspend or restore an account on behalf of `by`, such as plugin:<id>. */
  suspendAccount(did: string, by: string, reason?: string): Promise<boolean>
  restoreAccount(did: string, by: string): Promise<boolean>
}

export type PluginHost = {
  plugins: readonly Plugin[]
  providers: Registry<ModelProvider>
  tools: Registry<Tool<never>>
  toolSources: Registry<ToolSource>
  roleSources: Registry<RoleSource>
  ingesters: IngesterRegistry
  hooks: HookRunner
  close(): Promise<void>
}

export type LoadDeps = {
  services: PluginServices
  logger: Logger & { child(bindings: object): Logger }
  app: Readonly<{ name: string; publicUrl: string }>
}

export type LoadOptions = {
  /** Skip a failing plugin and report it here, instead of failing the whole load. */
  onFailure?: (index: number, error: Error) => void
}

const ID_PATTERN = /^[a-z0-9-]+$/

type Closer = () => void | Promise<void>

/** What a plugin registered during setup, held until setup finishes. */
type Staged = {
  providers: ModelProvider[]
  tools: Tool<never>[]
  toolSources: ToolSource[]
  roleSources: RoleSource[]
  ingesters: Ingester[]
  hooks: { name: HookName; handler: HookHandler<HookName>; order?: HookOrder }[]
  closers: Closer[]
}

function checkPlugin(plugin: Plugin, loaded: Set<string>) {
  if (!ID_PATTERN.test(plugin.id))
    throw new PluginLoadError(`Plugin ID "${plugin.id}" must match ${ID_PATTERN}`)
  if (loaded.has(plugin.id)) throw new PluginLoadError(`Two plugins use the ID "${plugin.id}"`)
  if (plugin.apiVersion !== PLUGIN_API_VERSION) {
    throw new PluginLoadError(
      `Plugin "${plugin.id}" targets plugin API version ${plugin.apiVersion}, but this server supports version ${PLUGIN_API_VERSION}`,
    )
  }
}

async function runClosers(closers: Closer[], logger: Logger) {
  for (const fn of [...closers].reverse()) {
    try {
      await fn()
    } catch (err) {
      logger.warn({ err }, 'plugin cleanup failed')
    }
  }
}

/** Check every plugin and call each setup once, in order. A plugin's registrations count only once its setup finishes. */
export async function loadPlugins(
  plugins: Plugin[],
  deps: LoadDeps,
  options: LoadOptions = {},
): Promise<PluginHost> {
  const loaded: Plugin[] = []
  const closers: Closer[] = []
  const host: PluginHost = {
    plugins: loaded,
    providers: new Registry('provider', (provider) => provider.id),
    tools: new Registry('tool', (tool) => tool.name),
    toolSources: new Registry('tool source', (source) => source.id),
    roleSources: new Registry('role source', (source) => source.id),
    ingesters: new IngesterRegistry(),
    hooks: new HookRunner(),
    close: () => runClosers(closers, deps.logger),
  }

  for (const [position, plugin] of plugins.entries()) {
    const staged: Staged = {
      providers: [],
      tools: [],
      toolSources: [],
      roleSources: [],
      ingesters: [],
      hooks: [],
      closers: [],
    }
    const ctx: PluginContext = {
      providers: { register: (provider) => void staged.providers.push(provider) },
      tools: { register: (tool) => void staged.tools.push(tool as Tool<never>) },
      toolSources: { register: (source) => void staged.toolSources.push(source) },
      roleSources: { register: (source) => void staged.roleSources.push(source) },
      accounts: {
        suspend: (did, suspension) =>
          deps.services.suspendAccount(did, `plugin:${plugin.id}`, suspension?.reason),
        restore: (did) => deps.services.restoreAccount(did, `plugin:${plugin.id}`),
      },
      ingesters: {
        register: (ingester) => void staged.ingesters.push(ingester),
        accepts: (mimeType) => host.ingesters.match(mimeType) !== undefined,
        ingest: async (file) => host.ingesters.match(file.mimeType)?.ingest(file),
      },
      hooks: {
        on: (name, handler, hookOptions) =>
          void staged.hooks.push({
            name,
            handler: handler as HookHandler<HookName>,
            order: hookOptions?.order,
          }),
      },
      models: { generateText: (request) => deps.services.generateText(request) },
      conversations: { updateInfo: (...args) => deps.services.updateInfo(...args) },
      userSettings: (user) => deps.services.userSettings(plugin, user),
      logger: deps.logger.child({ plugin: plugin.id }),
      app: deps.app,
      onClose: (fn) => void staged.closers.push(fn),
    }
    try {
      checkPlugin(plugin, new Set(loaded.map((p) => p.id)))
      await plugin.setup(ctx)
      host.providers.assertFree(staged.providers, plugin.id)
      host.tools.assertFree(staged.tools, plugin.id)
      host.toolSources.assertFree(staged.toolSources, plugin.id)
      host.roleSources.assertFree(staged.roleSources, plugin.id)
      host.ingesters.assertFree(staged.ingesters, plugin.id)
    } catch (err) {
      await runClosers(staged.closers, deps.logger)
      if (!options.onFailure) {
        await host.close()
        throw err
      }
      options.onFailure(position, err instanceof Error ? err : new Error(String(err)))
      continue
    }
    for (const provider of staged.providers) host.providers.register(provider, plugin.id)
    for (const tool of staged.tools) host.tools.register(tool, plugin.id)
    for (const source of staged.toolSources) host.toolSources.register(source, plugin.id)
    for (const source of staged.roleSources) host.roleSources.register(source, plugin.id)
    for (const ingester of staged.ingesters) host.ingesters.register(ingester, plugin.id)
    for (const hook of staged.hooks)
      host.hooks.add(hook.name, plugin.id, position, hook.handler as never, hook.order)
    closers.push(...staged.closers)
    loaded.push(plugin)
  }

  deps.logger.info({ hooks: host.hooks.describe() }, 'plugins loaded')
  return host
}
