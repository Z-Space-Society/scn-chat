import type { LanguageModelV4 } from '@scn-chat/plugin-api'
import { APICallError, RetryError, wrapLanguageModel } from 'ai'
import { safeErrorMessage } from '../safe-error.ts'
import type { ResolvedModel } from './catalog.ts'

/** Retry a busy provider for about a minute, at 2, 4, 8, 16, and 32 seconds, unless it asks for other waits. */
export const PROVIDER_RETRIES = 5

/** OpenAI's out of credit, and LiteLLM's key or proxy over its budget. */
const QUOTA_ERRORS = new Set(['insufficient_quota', 'budget_exceeded'])

const lastErrorOf = (err: unknown) => (RetryError.isInstance(err) ? err.lastError : err)

/** Has the key run out of credit or budget, rather than the provider asking us to slow down? */
export function isQuotaExhausted(err: unknown): boolean {
  const last = lastErrorOf(err)
  if (!APICallError.isInstance(last) || !last.responseBody) return false
  let body: { error?: { type?: unknown; code?: unknown } } | null
  try {
    body = JSON.parse(last.responseBody)
  } catch (parseErr) {
    if (parseErr instanceof SyntaxError) return false
    throw parseErr
  }
  return QUOTA_ERRORS.has(String(body?.error?.type)) || QUOTA_ERRORS.has(String(body?.error?.code))
}

/**
 * The model with a quota error made final, since waiting won't bring credit back, and `onRetry`
 * called whenever the provider turns away a request that will be tried again.
 */
export function withProviderRetries(
  model: LanguageModelV4,
  onRetry: () => void = () => {},
): LanguageModelV4 {
  const settle = async <T>(call: () => PromiseLike<T>): Promise<T> => {
    try {
      return await call()
    } catch (err) {
      if (!APICallError.isInstance(err) || !err.isRetryable) throw err
      if (isQuotaExhausted(err)) {
        throw new APICallError({
          message: err.message,
          url: err.url,
          requestBodyValues: err.requestBodyValues,
          statusCode: err.statusCode,
          responseHeaders: err.responseHeaders,
          responseBody: err.responseBody,
          data: err.data,
          cause: err,
          isRetryable: false,
        })
      }
      onRetry()
      throw err
    }
  }
  return wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: ({ doGenerate }) => settle(doGenerate),
      wrapStream: ({ doStream }) => settle(doStream),
    },
  })
}

/** A model call's error as the user reads it, saying plainly when a key is spent or rate limited. */
export function providerErrorMessage(
  err: unknown,
  model: Pick<ResolvedModel, 'source'> | undefined,
): string {
  if (!model) return safeErrorMessage(err)
  if (isQuotaExhausted(err)) {
    if (model.source === 'admin')
      return "This app's shared key has reached its usage limit. Add your own API key under Settings > API keys to keep chatting."
    return 'Your API key has run out of credit or reached its spending limit. Add credit to the account it belongs to, or use a different key.'
  }
  const last = lastErrorOf(err)
  if (APICallError.isInstance(last) && last.statusCode === 429)
    return 'The model provider is limiting requests right now. Try again in a minute.'
  return safeErrorMessage(err)
}
