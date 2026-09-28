import { createGoogle } from '@ai-sdk/google'
import { keyedProvider, keyedProviderOptions } from '@scn-chat/plugin-api'

export const optionsSchema = keyedProviderOptions

/** Gemini models through Google's API. */
export default keyedProvider({
  id: 'google',
  name: 'Google',
  replay: 'replay',
  create: (apiKey) => createGoogle({ apiKey }),
})
