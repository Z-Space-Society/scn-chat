import { definePlugin } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = z
  .object({ greeting: z.string().default('hello'), count: z.number().optional() })
  .strict()

export default function good(options: z.infer<typeof optionsSchema>) {
  return definePlugin({
    id: `good-${options.greeting}`,
    name: 'Good',
    apiVersion: 1,
    setup: () => {},
  })
}
