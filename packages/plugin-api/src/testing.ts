import type { ModelProvider, Plugin, PluginContext } from './index.ts'

/** Run a plugin's setup against a recording context, for plugin tests. */
export async function setupForTest(plugin: Plugin) {
  const providers: ModelProvider[] = []
  const ingesters: Parameters<PluginContext['ingesters']['register']>[0][] = []
  const hooks: { name: string; handler: unknown }[] = []
  const noop = () => {}
  const ctx = {
    providers: { register: (provider: ModelProvider) => void providers.push(provider) },
    tools: { register: noop },
    toolSources: { register: noop },
    ingesters: {
      register: (ingester: (typeof ingesters)[number]) => void ingesters.push(ingester),
    },
    hooks: { on: (name: string, handler: unknown) => void hooks.push({ name, handler }) },
    models: { generateText: async () => ({ text: '', finishReason: 'stop' }) },
    conversations: { updateInfo: async () => {} },
    userSettings: async () => ({}),
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    app: { name: 'Test', publicUrl: 'http://127.0.0.1:3000' },
    onClose: noop,
  } as unknown as PluginContext
  await plugin.setup(ctx)
  return { providers, ingesters, hooks, ctx }
}
