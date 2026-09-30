import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, onUnauthorized, read } from '../src/api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('read', () => {
  it('tells listeners when a request finds the session has ended', async () => {
    const listener = vi.fn()
    const stop = onUnauthorized(listener)
    const response = Promise.resolve(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    await expect(read(response as never)).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
    stop()
  })

  it('reports the status when an error body is not JSON', async () => {
    const response = Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(read(response as never)).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with 502',
    })
  })

  it("logs a failed request's status and message to the console", async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = Promise.resolve(
      Response.json(
        { error: 'PdsError', message: 'Your PDS refused the request' },
        { status: 502 },
      ),
    )
    await expect(read(response as never)).rejects.toBeInstanceOf(ApiError)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Request failed: 502'),
      'Your PDS refused the request',
    )
  })

  it('does not log a request that found the user signed out', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = Promise.resolve(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    await expect(read(response as never)).rejects.toBeInstanceOf(ApiError)
    expect(error).not.toHaveBeenCalled()
  })
})
