import { vi } from 'vitest'

export const attachmentTypes = { images: ['image/png', 'image/jpeg'], files: ['application/pdf'] }

/** What the Composer loads: no models of the user's own, and an admin default to fall back to. */
const loads: Record<string, unknown> = {
  '/api/attachments/types': attachmentTypes,
  '/api/models': { models: [], defaultModel: { provider: 'p', id: 'default' } },
  '/api/preferences': { preferences: null },
}

/**
 * A fetch that answers the Composer's loads, with any of them overridden by path, then whatever
 * the test needs.
 */
export function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response('{}'),
  overrides: Record<string, unknown> = {},
) {
  const answers = { ...loads, ...overrides }
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    isRead(init) && url in answers
      ? Promise.resolve(Response.json(answers[url]))
      : handler(url, init),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const isRead = (init?: RequestInit) => (init?.method ?? 'GET') === 'GET'

/** The writes made, leaving out every read. */
export const writes = (fetch: ReturnType<typeof stubFetch>) =>
  fetch.mock.calls.filter(([, init]) => !isRead(init))
