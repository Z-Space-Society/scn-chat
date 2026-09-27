import { createAnthropic } from '@ai-sdk/anthropic'
import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({ apiKey: z.string().min(1).optional(), userKeys: z.boolean().optional() })
  .strict()

export type AnthropicOptions = z.infer<typeof optionsSchema>

/** Claude models through Anthropic's API. */
export default function anthropic(options: AnthropicOptions = {}) {
  return definePlugin({
    id: 'anthropic',
    name: 'Anthropic',
    apiVersion: 1,
    setup(ctx) {
      ctx.providers.register({
        id: 'anthropic',
        name: 'Anthropic',
        hasAdminKey: Boolean(options.apiKey),
        userKeys: options.userKeys ?? true,
        replay: 'replay',
        createModel: ({ modelId, apiKey }) =>
          createAnthropic({ apiKey: apiKey ?? options.apiKey })(modelId),
      })
    },
  })
}
