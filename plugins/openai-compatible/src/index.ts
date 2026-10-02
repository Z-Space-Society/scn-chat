import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { definePlugin, type ModelInfo } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .meta({
        title: 'Provider ID',
        description: "Used in model references, such as 'scn' or 'llama'. Fixed once added.",
      }),
    name: z.string().min(1).meta({ title: 'Name' }),
    baseURL: z.url().optional().meta({ title: 'Base URL', description: 'The admin endpoint.' }),
    apiKey: z.string().min(1).optional().meta({ title: 'API key', secret: true }),
    userKeys: z.boolean().optional().meta({ title: 'Allow users to add their own keys' }),
    userEndpoints: z.boolean().optional().meta({ title: 'Allow users to set their own endpoints' }),
    allowPrivateNetworks: z.boolean().optional().meta({
      title: 'User endpoints can reach private networks',
      description: 'For self-hosted local models.',
    }),
  })
  .strict()

export type OpenAICompatibleOptions = z.infer<typeof optionsSchema>

/** Each endpoint is its own instance, with its own provider ID. */
export const multipleInstances = true

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
        // Local servers such as llama.cpp and Ollama don't need a key.
        hasAdminKey: Boolean(options.baseURL),
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
