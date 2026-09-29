import {
  type GenerateTextRequest,
  type InfoPatch,
  type Ingester,
  type Logger,
  type ModelProvider,
  PLUGIN_API_VERSION,
  type Plugin,
  type PluginContext,
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
}

export type PluginHost = {
  plugins: readonly Plugin[]
  providers: Registry<ModelProvider>
  tools: Registry<Tool<never>>
  toolSources: Registry<ToolSource>
  ingesters: IngesterRegistry
  hooks: HookRunner
  close(): Promise<void>
}

const ID_PATTERN = /^[a-z0-9-]+$/

/** Check every plugin, then call each setup once, in config order. */
export async function loadPlugins(
  plugins: Plugin[],
  deps: {
    services: PluginServices
    logger: Logger & { child(bindings: object): Logger }
    app: { name: string; publicUrl: string }
  },
): Promise<PluginHost> {
  const seen = new Set<string>()
  for (const plugin of plugins) {
    if (!ID_PATTERN.test(plugin.id))
      throw new PluginLoadError(`Plugin ID "${plugin.id}" must match ${ID_PATTERN}`)
    if (seen.has(plugin.id)) throw new PluginLoadError(`Two plugins use the ID "${plugin.id}"`)
    seen.add(plugin.id)
    if (plugin.apiVersion !== PLUGIN_API_VERSION) {
      throw new PluginLoadError(
        `Plugin "${plugin.id}" targets plugin API version ${plugin.apiVersion}, but this server supports version ${PLUGIN_API_VERSION}`,
      )
    }
  }

  const host: PluginHost = {
    plugins,
    providers: new Registry('provider', (provider) => provider.id),
    tools: new Registry('tool', (tool) => tool.name),
    toolSources: new Registry('tool source', (source) => source.id),
    ingesters: new IngesterRegistry(),
    hooks: new HookRunner(),
    close: async () => {
      for (const fn of closers.reverse()) await fn()
    },
  }
  const closers: (() => void | Promise<void>)[] = []

  for (const [position, plugin] of plugins.entries()) {
    const ctx: PluginContext = {
      providers: {
        register: (provider: ModelProvider) => host.providers.register(provider, plugin.id),
      },
      tools: { register: (tool) => host.tools.register(tool as Tool<never>, plugin.id) },
      toolSources: {
        register: (source: ToolSource) => host.toolSources.register(source, plugin.id),
      },
      ingesters: {
        register: (ingester: Ingester) => host.ingesters.register(ingester, plugin.id),
        accepts: (mimeType) => host.ingesters.match(mimeType) !== undefined,
        ingest: async (file) => host.ingesters.match(file.mimeType)?.ingest(file),
      },
      hooks: {
        on: (name, handler, options) =>
          host.hooks.add(name, plugin.id, position, handler, options?.order),
      },
      models: { generateText: (request) => deps.services.generateText(request) },
      conversations: { updateInfo: (...args) => deps.services.updateInfo(...args) },
      userSettings: (user) => deps.services.userSettings(plugin, user),
      logger: deps.logger.child({ plugin: plugin.id }),
      app: Object.freeze({ ...deps.app }),
      onClose: (fn) => closers.push(fn),
    }
    await plugin.setup(ctx)
  }

  deps.logger.info({ hooks: host.hooks.describe() }, 'plugins loaded')
  return host
}
