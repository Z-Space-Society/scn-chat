import { APICallError, RetryError } from 'ai'
import { describe, expect, it } from 'vitest'
import { isQuotaExhausted } from '../../src/providers/retries.ts'

const failure = (responseBody: string | undefined) =>
  new APICallError({
    message: 'Provider error',
    url: 'https://provider.test/v1/chat/completions',
    requestBodyValues: {},
    statusCode: 429,
    responseBody,
  })

const outOfCredit = JSON.stringify({
  error: {
    message: 'You exceeded your current quota, please check your plan and billing details.',
    type: 'insufficient_quota',
    param: null,
    code: 'insufficient_quota',
  },
})

describe('isQuotaExhausted', () => {
  it('finds a spent key behind the retries that came before it', () => {
    const err = new RetryError({
      message: 'Failed after 2 attempts',
      reason: 'maxRetriesExceeded',
      errors: [failure('{}'), failure(outOfCredit)],
    })
    expect(isQuotaExhausted(err)).toBe(true)
  })

  it.each([
    ['a body that is not JSON', '<html>Too Many Requests</html>'],
    ['a JSON body that is not an object', 'null'],
  ])('treats a rate limit with %s as a rate limit, not a spent key', (_name, body) => {
    expect(isQuotaExhausted(failure(body))).toBe(false)
  })
})
