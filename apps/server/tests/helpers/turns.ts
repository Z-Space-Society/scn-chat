import type { LanguageModelV4, ModelProvider } from '@scn-chat/plugin-api'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { createRoles } from '../../src/auth/roles.ts'
import type { ModelConfig } from '../../src/config.ts'
import type { PluginHost } from '../../src/plugins/host.ts'
import { Registry } from '../../src/plugins/registry.ts'
import { ModelCatalog } from '../../src/providers/catalog.ts'
import { SecretBox } from '../../src/secrets.ts'
import { type TurnBlobs, TurnRunner } from '../../src/turns/runner.ts'
import { StreamHub } from '../../src/turns/stream-hub.ts'
import { spacesHarness } from './spaces.ts'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}

/** Stream parts for a plain text reply. */
export function textReply(text: string) {
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    ...[...text].map((char) => ({ type: 'text-delta', id: 't1', delta: char })),
    { type: 'text-end', id: 't1' },
    { type: 'finish', usage, finishReason: { unified: 'stop', raw: 'stop' } },
  ]
}

/** A model that streams the given parts, recording each prompt it was sent. */
export function scriptedModel(parts: unknown[], options: { delayMs?: number; fail?: Error } = {}) {
  const prompts: unknown[] = []
  const model = new MockLanguageModelV4({
    doStream: async (call) => {
      prompts.push(call.prompt)
      if (options.fail) throw options.fail
      return {
        stream: simulateReadableStream({
          chunks: parts as never[],
          chunkDelayInMs: options.delayMs ?? 0,
        }),
      }
    },
  })
  return { model, prompts }
}

/** A model that answers each call with the next response in the list. */
export function sequenceModel(responses: unknown[][]) {
  let call = 0
  const prompts: unknown[] = []
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      prompts.push(options.prompt)
      const parts = responses[Math.min(call++, responses.length - 1)] ?? []
      return { stream: simulateReadableStream({ chunks: parts as never[], chunkDelayInMs: 0 }) }
    },
  })
  return { model, prompts }
}

export async function turnsHarness(
  options: {
    storageMode?: 'space' | 'local'
    model?: () => LanguageModelV4
    adminModels?: Partial<ModelConfig>[]
    host?: PluginHost
    ratePerMinute?: number
    timeoutMs?: number
  } = {},
) {
  const h = await spacesHarness({ storageMode: options.storageMode })
  let modelFactory = options.model ?? (() => scriptedModel(textReply('Hello')).model)
  const created: string[] = []
  const provider: ModelProvider = {
    id: 'fake',
    name: 'Fake',
    hasAdminKey: true,
    userKeys: true,
    replay: 'replay',
    createModel: ({ modelId }) => {
      created.push(modelId)
      return modelFactory()
    },
  }
  const providers = new Registry<ModelProvider>('provider', (p) => p.id)
  providers.register(provider, 'test')
  const caps = { vision: true, reasoning: true, tools: true }
  const adminModels = (options.adminModels ?? [{ id: 'default-model', default: true }]).map(
    (m) => ({
      provider: 'fake',
      id: 'm',
      name: 'M',
      capabilities: caps,
      roles: ['user'],
      ...m,
    }),
  ) as ModelConfig[]
  const catalog = new ModelCatalog({
    db: h.db,
    box: new SecretBox(Buffer.alloc(32, 8)),
    providers,
    adminModels,
    roles: createRoles(),
    guardedFetch: fetch,
    logger: h.logger,
  })
  const stored = new Map<string, Uint8Array>()
  const blobs: TurnBlobs = {
    reader: () => async (cid) => ({
      bytes: stored.get(cid) ?? new Uint8Array(),
      mimeType: 'text/plain',
    }),
    put: async (_account, bytes, mimeType) => {
      const cid = `bafkrei${stored.size}fake`
      stored.set(cid, bytes)
      return {
        $type: 'blob',
        ref: { $link: 'bafkreibme22gw2h7y2h7tg2fhqotaqjucnbc24deqo72b6mkl2egezxhvy' },
        mimeType,
        size: bytes.length,
      }
    },
  }
  const hub = new StreamHub()
  const runner = new TurnRunner({
    db: h.db,
    services: h.services,
    catalog,
    host: options.host,
    hub,
    blobs,
    config: {
      ratePerMinute: options.ratePerMinute ?? 100,
      maxSteps: 4,
      timeoutMs: options.timeoutMs ?? 10_000,
      backfillWindowMs: 60 * 60_000,
    },
    logger: h.logger,
  })
  const setModel = (factory: () => LanguageModelV4) => {
    modelFactory = factory
  }
  const messages = async (skey: string) => {
    const { messages } = await h.chats.getConversation(skey)
    return new Map(messages.map((m) => [m.rkey, m.value]))
  }
  return { ...h, runner, hub, catalog, created, setModel, messages, blobs, stored }
}
