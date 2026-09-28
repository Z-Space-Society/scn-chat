import { vi } from 'vitest'

export const attachmentTypes = { images: ['image/png', 'image/jpeg'], files: ['application/pdf'] }

/** A fetch that answers the Composer's attachment types request, then whatever the test needs. */
export function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response('{}'),
) {
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    url === '/api/attachments/types'
      ? Promise.resolve(Response.json(attachmentTypes))
      : handler(url, init),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/** The requests made, apart from loading the attachment types. */
export const requests = (fetch: ReturnType<typeof stubFetch>) =>
  fetch.mock.calls.filter(([url]) => url !== '/api/attachments/types')
