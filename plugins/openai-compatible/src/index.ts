import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { definePlugin, type ModelInfo } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({
    /** Provider ID used in model references, such as 'scn' or 'ollama'. */
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    baseURL: z.url().optional(),
    apiKey: z.string().min(1).optional(),
    userKeys: z.boolean().optional(),
    userEndpoints: z.boolean().optional(),
    /** Let user endpoints reach private network addresses, for self-hosted local models. */
    allowPrivateNetworks: z.boolean().optional(),
  })
  .strict()

export type OpenAICompatibleOptions = z.infer<typeof optionsSchema>

const modelList = z.object({ data: z.array(z.object({ id: z.string().min(1) })) })

/** Any OpenAI-compatible endpoint: OpenRouter, scn, co/core, llama.cpp, vLLM, Ollama, and others. */
export default function openaiCompatible(options: OpenAICompatibleOptions) {
  return definePlugin({
    id: `openai-compatible-${options.id}`,
    name: options.name,
    apiVersion: 1,
    setup(ctx) {
      ctx.providers.register({
        id: options.id,
        name: options.name,
        hasAdminKey: Boolean(options.apiKey && options.baseURL),
        userKeys: options.userKeys ?? true,
        userEndpoints: options.userEndpoints ?? false,
        allowPrivateNetworks: options.allowPrivateNetworks ?? false,
        replay: 'drop',
        createModel: ({ modelId, apiKey, baseURL, fetch }) => {
          const url = baseURL ?? options.baseURL
          if (!url) throw new Error(`Provider "${options.id}" has no base URL`)
          return createOpenAICompatible({
            name: options.id,
            baseURL: url,
            apiKey: apiKey ?? options.apiKey,
            includeUsage: true,
            fetch,
          })(modelId)
        },
        async listModels({ apiKey, baseURL, fetch = globalThis.fetch }) {
          const url = baseURL ?? options.baseURL
          if (!url) throw new Error(`Provider "${options.id}" has no base URL`)
          const key = apiKey ?? options.apiKey
          const response = await fetch(`${url.replace(/\/$/, '')}/models`, {
            headers: key ? { authorization: `Bearer ${key}` } : {},
            redirect: 'error',
          })
          if (!response.ok) throw new Error(`Listing models at ${url} returned ${response.status}`)
          const body = modelList.safeParse(await response.json())
          if (!body.success)
            throw new Error(`${url}/models did not return an OpenAI-style model list`)
          return body.data.data.map(
            (model): ModelInfo => ({
              id: model.id,
              name: model.id,
              capabilities: { vision: false, reasoning: false, tools: false },
            }),
          )
        },
      })
    },
  })
}
