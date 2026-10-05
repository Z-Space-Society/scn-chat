import { createGoogle } from '@ai-sdk/google'
import { fetchModelList, keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'
import { z } from 'zod'

export const optionsSchema = keyedProviderOptions

const modelList = z.object({
  models: z.array(
    z.object({
      name: z.string().min(1),
      displayName: z.string().optional(),
      supportedGenerationMethods: z.array(z.string()).default([]),
    }),
  ),
})

/** Gemini models through Google's API. */
export default keyedProvider({
  id: 'google',
  name: 'Google',
  replay: 'replay',
  create: (apiKey) => createGoogle({ apiKey }),
  list: (apiKey, fetch) =>
    fetchModelList({
      fetch,
      url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      headers: { 'x-goog-api-key': apiKey },
      schema: modelList,
      models: (body) =>
        body.models
          .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
          .map((m) => {
            const id = m.name.replace(/^models\//, '')
            return { id, name: m.displayName ?? id }
          }),
    }),
})
