import { createOpenAI } from '@ai-sdk/openai'
import { fetchModelList, keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = keyedProviderOptions

const modelList = z.object({ data: z.array(z.object({ id: z.string().min(1) })) })

/** OpenAI models through the Responses API, with reasoning returned encrypted so OpenAI stores nothing. */
export default keyedProvider({
  id: 'openai',
  name: 'OpenAI',
  replay: 'replay',
  providerOptions: { openai: { store: false, include: ['reasoning.encrypted_content'] } },
  create: (apiKey) => createOpenAI({ apiKey }),
  list: (apiKey, fetch) =>
    fetchModelList({
      fetch,
      url: 'https://api.openai.com/v1/models',
      headers: { authorization: `Bearer ${apiKey}` },
      schema: modelList,
      models: (body) => body.data.map((m) => ({ id: m.id, name: m.id })),
    }),
})
