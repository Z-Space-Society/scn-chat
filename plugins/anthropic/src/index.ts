import { createAnthropic } from '@ai-sdk/anthropic'
import { fetchModelList, keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = keyedProviderOptions

const modelList = z.object({
  data: z.array(z.object({ id: z.string().min(1), display_name: z.string().optional() })),
})

/** Claude models through Anthropic's API. */
export default keyedProvider({
  id: 'anthropic',
  name: 'Anthropic',
  replay: 'replay',
  create: (apiKey) => createAnthropic({ apiKey }),
  list: (apiKey, fetch) =>
    fetchModelList({
      fetch,
      url: 'https://api.anthropic.com/v1/models?limit=1000',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      schema: modelList,
      models: (body) => body.data.map((m) => ({ id: m.id, name: m.display_name ?? m.id })),
    }),
})
