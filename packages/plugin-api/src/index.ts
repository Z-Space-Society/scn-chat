import type { LanguageModelV4 } from '@ai-sdk/provider'
import type {
  Effort,
  InfoRecord,
  MessageRecord,
  ModelRef,
  PlainContent,
  PreferencesRecord,
} from '@scn-chat/lexicons'
import { z } from 'zod'

export type {
  Effort,
  InfoRecord,
  LanguageModelV4,
  MessageRecord,
  ModelRef,
  PlainContent,
  PreferencesRecord,
}

/** The plugin API major version this package describes. */
export const PLUGIN_API_VERSION = 1

// Providers

export type Capabilities = { vision: boolean; reasoning: boolean; tools: boolean }

export type ModelInfo = { id: string; name: string; capabilities: Capabilities }

/** Whether earlier reasoning and provider data are sent back to this provider on later turns. */
export type ReplayPolicy = 'replay' | 'drop'

export type ModelAccess = {
  modelId: string
  /** A user's own key. When absent, the provider uses its admin key. */
  apiKey?: string
  /** A user's own endpoint, for providers that allow user endpoints. */
  baseURL?: string
  /** A fetch the provider must use for user endpoints, guarded against private networks. */
  fetch?: typeof globalThis.fetch
}

export interface ModelProvider {
  id: string
  name: string
  hasAdminKey: boolean
  userKeys: boolean
  userEndpoints?: boolean
  allowPrivateNetworks?: boolean
  replay: ReplayPolicy
  /** Provider options sent with every call to this provider's models, keyed by provider name. */
  providerOptions?: Record<string, Record<string, JsonValue>>
  createModel(access: ModelAccess): LanguageModelV4
  listModels?(access: Omit<ModelAccess, 'modelId'>): Promise<ModelInfo[]>
}

// Tools

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ToolContext = { user: string; conversation: string; signal: AbortSignal }

export interface Tool<Input = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<Input>
  run(input: Input, context: ToolContext): Promise<JsonValue>
}

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolSource {
  id: string
  list(user: string): Promise<ToolDefinition[]>
  call(user: string, name: string, input: unknown, context: ToolContext): Promise<JsonValue>
}

// Ingesters

export type IngestInput = { bytes: Uint8Array; mimeType: string; name?: string }

export interface Ingester {
  id: string
  accepts: string[]
  priority?: number
  method: 'text' | 'ocr'
  ingest(file: IngestInput): Promise<{ text: string }>
}

// Hooks

export type TurnContext = {
  user: string
  /** `info` is missing when another client created the conversation without one. */
  conversation: { uri: string; info?: InfoRecord }
  preferences?: PreferencesRecord
  userMessage: { rkey: string; record: MessageRecord }
  reply: { rkey: string; record: MessageRecord }
  /** Missing when no model was chosen and there is no default, which fails the turn. */
  model?: ModelRef
  effort?: Effort
  /** Tools offered to the model this turn. */
  tools: string[]
}

export type BranchMessage = { rkey: string; author: string; record: MessageRecord }

export type PromptValue = { instructions: string; messages: BranchMessage[] }

export type FilterHooks = {
  'messages:beforeModel': { value: PromptValue; context: TurnContext }
  'message:afterModel': { value: PlainContent; context: TurnContext }
}

export type ActionHooks = {
  'turn:after': TurnContext
  'conversation:created': { user: string; conversation: string }
  'conversation:deleted': { user: string; conversation: string }
}

export type HookName = keyof FilterHooks | keyof ActionHooks

export type HookOrder = 'pre' | 'normal' | 'post'

export type FilterHandler<N extends keyof FilterHooks> = (
  value: FilterHooks[N]['value'],
  context: FilterHooks[N]['context'],
) => FilterHooks[N]['value'] | Promise<FilterHooks[N]['value']>

export type ActionHandler<N extends keyof ActionHooks> = (
  payload: ActionHooks[N],
) => void | Promise<void>

export type HookHandler<N extends HookName> = N extends keyof FilterHooks
  ? FilterHandler<N>
  : N extends keyof ActionHooks
    ? ActionHandler<N>
    : never

// Context

export type GenerateTextRequest = {
  user: string
  model: ModelRef
  system?: string
  prompt: string
  maxOutputTokens?: number
  /** Ignored by models without reasoning. Unset uses the provider default. */
  effort?: Effort
  signal?: AbortSignal
}

export type InfoPatch = Partial<Omit<InfoRecord, '$type' | 'createdAt'>>

export type Logger = {
  debug(obj: object, msg?: string): void
  info(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
}

export interface PluginContext<UserSettings = unknown> {
  providers: { register(provider: ModelProvider): void }
  tools: { register(tool: Tool<never>): void }
  toolSources: { register(source: ToolSource): void }
  ingesters: { register(ingester: Ingester): void }
  hooks: {
    on<N extends HookName>(name: N, handler: HookHandler<N>, options?: { order?: HookOrder }): void
  }
  models: {
    generateText(request: GenerateTextRequest): Promise<{ text: string; finishReason: string }>
  }
  conversations: {
    updateInfo(
      user: string,
      conversation: string,
      patch: InfoPatch,
      options?: { unlessUserTitled?: boolean },
    ): Promise<void>
  }
  userSettings(user: string): Promise<UserSettings>
  logger: Logger
  app: Readonly<{ name: string; publicUrl: string }>
  onClose(fn: () => void | Promise<void>): void
}

export interface Plugin<UserSettings = unknown> {
  id: string
  name: string
  apiVersion: number
  userSettings?: z.ZodObject<z.ZodRawShape> & z.ZodType<UserSettings>
  setup(ctx: PluginContext<UserSettings>): void | Promise<void>
}

export function definePlugin<UserSettings = unknown>(
  plugin: Plugin<UserSettings>,
): Plugin<UserSettings> {
  return plugin
}

/** Options for a provider plugin that only needs an API key. */
export const keyedProviderOptions = z
  .object({ apiKey: z.string().min(1).optional(), userKeys: z.boolean().optional() })
  .strict()

export type KeyedProviderOptions = z.infer<typeof keyedProviderOptions>

/** Build the factory for a provider plugin only needs an API key. */
export function keyedProvider(provider: {
  id: string
  name: string
  replay: ReplayPolicy
  providerOptions?: ModelProvider['providerOptions']
  create: (apiKey: string | undefined) => (modelId: string) => LanguageModelV4
}) {
  return (options: KeyedProviderOptions = {}) =>
    definePlugin({
      id: provider.id,
      name: provider.name,
      apiVersion: PLUGIN_API_VERSION,
      setup(ctx) {
        ctx.providers.register({
          id: provider.id,
          name: provider.name,
          hasAdminKey: Boolean(options.apiKey),
          userKeys: options.userKeys ?? true,
          replay: provider.replay,
          ...(provider.providerOptions ? { providerOptions: provider.providerOptions } : {}),
          createModel: ({ modelId, apiKey }) => provider.create(apiKey ?? options.apiKey)(modelId),
        })
      },
    })
}
