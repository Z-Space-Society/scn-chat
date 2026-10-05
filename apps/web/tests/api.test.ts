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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))
    await expect(read(response as never)).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with 502',
    })
  })
})
