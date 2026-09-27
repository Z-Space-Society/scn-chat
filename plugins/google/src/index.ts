import { createGoogle } from '@ai-sdk/google'
import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({ apiKey: z.string().min(1).optional(), userKeys: z.boolean().optional() })
  .strict()

export type GoogleOptions = z.infer<typeof optionsSchema>

/** Gemini models through Google's API. */
export default function google(options: GoogleOptions = {}) {
  return definePlugin({
    id: 'google',
    name: 'Google',
    apiVersion: 1,
    setup(ctx) {
      ctx.providers.register({
        id: 'google',
        name: 'Google',
        hasAdminKey: Boolean(options.apiKey),
        userKeys: options.userKeys ?? true,
        replay: 'replay',
        createModel: ({ modelId, apiKey }) =>
          createGoogle({ apiKey: apiKey ?? options.apiKey })(modelId),
      })
    },
  })
}
