import { createAnthropic } from '@ai-sdk/anthropic'
import { keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'

export const optionsSchema = keyedProviderOptions

/** Claude models through Anthropic's API. */
export default keyedProvider({
  id: 'anthropic',
  name: 'Anthropic',
  replay: 'replay',
  create: (apiKey) => createAnthropic({ apiKey }),
})
