import type { GenerateTextRequest } from '@scn-chat/plugin-api'
import { generateText } from 'ai'
import type { Logger } from '../logger.ts'
import type { ModelCatalog } from './catalog.ts'
import { mapEffort } from './effort.ts'

/** Make one-off model calls for plugins, resolving the model the same way as a turn. */
export function createGenerateText(catalog: ModelCatalog, logger: Logger) {
  return async (request: GenerateTextRequest): Promise<{ text: string; finishReason: string }> => {
    const resolved = await catalog.resolve(request.user, request.model)
    const result = await generateText({
      model: resolved.model,
      instructions: request.system,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      reasoning: resolved.capabilities.reasoning ? mapEffort(request.effort, logger) : undefined,
      abortSignal: request.signal,
      providerOptions: resolved.provider.providerOptions as never,
    })
    return { text: result.text, finishReason: result.finishReason }
  }
}
