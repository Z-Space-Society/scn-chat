import pino, { type Logger } from 'pino'

export type { Logger }

// AI SDK errors keep the request and response bodies, which hold the user's conversation.
const CONTENT_KEYS = new Set(['requestBodyValues', 'responseBody', 'prompt'])

/** Serialize an error, and any errors nested in it, without chat content. */
export function serializeError(value: unknown): unknown {
  if (value instanceof Error) return serializeError(pino.stdSerializers.err(value))
  if (Array.isArray(value)) return value.map(serializeError)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !CONTENT_KEYS.has(key))
      .map(([key, nested]) => [key, serializeError(nested)]),
  )
}

export function createLogger(level: string): Logger {
  return pino({ level, serializers: { err: serializeError } })
}
