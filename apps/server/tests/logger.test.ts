import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { serializeError } from '../src/logger.ts'

const apiError = () =>
  new APICallError({
    message: 'Rate limited',
    url: 'https://api.example.com/v1/chat',
    requestBodyValues: { messages: [{ role: 'user', content: 'my secret question' }] },
    statusCode: 429,
    responseBody: '{"echo":"my secret question"}',
  })

describe('serializeError', () => {
  it('keeps the error message and status but drops the request and response bodies', () => {
    const serialized = serializeError(apiError()) as Record<string, unknown>
    expect(serialized).toMatchObject({ message: 'Rate limited', statusCode: 429 })
    expect(JSON.stringify(serialized)).not.toContain('my secret question')
  })

  it('drops the bodies from errors nested in other errors', () => {
    const retry = Object.assign(new Error('Failed after 3 attempts'), { errors: [apiError()] })
    const wrapped = new Error('turn failed', { cause: retry })
    expect(JSON.stringify(serializeError(wrapped))).not.toContain('my secret question')
  })
})
