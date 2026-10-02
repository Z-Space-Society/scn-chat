import {
  type Citation,
  type Ingester,
  type ModelProvider,
  matchIngester,
  type Plugin,
  type PluginContext,
  type RoleSource,
  type Tool,
  type ToolContext,
} from './index.ts'

/** Run a plugin's setup against a recording context, for plugin tests. */
export async function setupForTest(
  plugin: Plugin,
  options: {
    /** Ingesters from other plugins, which the plugin can reach through `ctx.ingesters`. */
    ingesters?: Ingester[]
    userSettings?: (user: string) => unknown
    app?: { name: string; publicUrl: string }
  } = {},
) {
  const providers: ModelProvider[] = []
  const tools: Tool<unknown>[] = []
  const ingesters: Ingester[] = []
  const roleSources: RoleSource[] = []
  const accountChanges: { action: 'suspend' | 'restore'; did: string; reason?: string }[] = []
  const hooks: { name: string; handler: unknown }[] = []
  const reachable = () => [...ingesters, ...(options.ingesters ?? [])]
  const noop = () => {}
  const ctx = {
    providers: { register: (provider: ModelProvider) => void providers.push(provider) },
    tools: { register: (tool: Tool<unknown>) => void tools.push(tool) },
    toolSources: { register: noop },
    roleSources: { register: (source: RoleSource) => void roleSources.push(source) },
    accounts: {
      suspend: async (did: string, options?: { reason?: string }) => {
        accountChanges.push({ action: 'suspend', did, ...options })
        return true
      },
      restore: async (did: string) => {
        accountChanges.push({ action: 'restore', did })
        return true
      },
    },
    ingesters: {
      register: (ingester: Ingester) => void ingesters.push(ingester),
      accepts: (mimeType: string) => matchIngester(reachable(), mimeType) !== undefined,
      ingest: async (file: Parameters<Ingester['ingest']>[0]) =>
        matchIngester(reachable(), file.mimeType)?.ingest(file),
    },
    hooks: { on: (name: string, handler: unknown) => void hooks.push({ name, handler }) },
    models: { generateText: async () => ({ text: '', finishReason: 'stop' }) },
    conversations: { updateInfo: async () => {} },
    userSettings: async (user: string) => options.userSettings?.(user) ?? {},
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    app: options.app ?? { name: 'Test', publicUrl: 'http://127.0.0.1:3000' },
    onClose: noop,
  } as unknown as PluginContext
  await plugin.setup(ctx)
  return { providers, tools, ingesters, roleSources, accountChanges, hooks, ctx }
}

/** A tool context that records citations, for tool tests. */
export function toolContextForTest(
  options: {
    fetch?: typeof globalThis.fetch
    user?: string
    conversation?: string
    roles?: string[]
    signal?: AbortSignal
  } = {},
) {
  const citations: Citation[] = []
  const context: ToolContext = {
    user: options.user ?? 'did:plc:alice',
    conversation: options.conversation ?? 'at://did:plc:alice/space/c/1',
    roles: options.roles ?? ['user'],
    signal: options.signal ?? new AbortController().signal,
    fetch: options.fetch ?? (() => Promise.reject(new Error('No fetch in this test'))),
    cite: (source) => void citations.push(source),
    turnCache: new Map(),
  }
  return { context, citations }
}
