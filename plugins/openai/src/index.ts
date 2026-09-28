import { createOpenAI } from '@ai-sdk/openai'
import { keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'

export const optionsSchema = keyedProviderOptions

/** OpenAI models through the Responses API, with reasoning returned encrypted so OpenAI stores nothing. */
export default keyedProvider({
  id: 'openai',
  name: 'OpenAI',
  replay: 'replay',
  providerOptions: { openai: { store: false, include: ['reasoning.encrypted_content'] } },
  create: (apiKey) => createOpenAI({ apiKey }),
})
