import { createOpenAI } from '@ai-sdk/openai'
import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({ apiKey: z.string().min(1).optional(), userKeys: z.boolean().optional() })
  .strict()

export type OpenAIOptions = z.infer<typeof optionsSchema>

/** OpenAI models through the Responses API, with reasoning returned encrypted so OpenAI stores nothing. */
export default function openai(options: OpenAIOptions = {}) {
  return definePlugin({
    id: 'openai',
    name: 'OpenAI',
    apiVersion: 1,
    setup(ctx) {
      ctx.providers.register({
        id: 'openai',
        name: 'OpenAI',
        hasAdminKey: Boolean(options.apiKey),
        userKeys: options.userKeys ?? true,
        replay: 'replay',
        providerOptions: { openai: { store: false, include: ['reasoning.encrypted_content'] } },
        createModel: ({ modelId, apiKey }) =>
          createOpenAI({ apiKey: apiKey ?? options.apiKey })(modelId),
      })
    },
  })
}
