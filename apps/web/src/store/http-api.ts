import { errorMessage } from '../lib/response.ts'
import type { ConversationChanges, IndexChanges, RecordKey, StoreApi } from './core.ts'

export class Unauthorized extends Error {
  constructor() {
    super('The session has ended')
    this.name = 'Unauthorized'
  }
}

async function get<T>(fetchImpl: typeof fetch, path: string): Promise<T> {
  const res = await fetchImpl(path, { credentials: 'same-origin' })
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}: ${await errorMessage(res)}`)
  return (await res.json()) as T
}

const since = (rev?: string | null) => (rev ? `?since=${encodeURIComponent(rev)}` : '')

/** The server routes the store syncs through. */
export function httpApi(fetchImpl: typeof fetch = fetch): StoreApi {
  return {
    fetchIndex: (rev) => get<IndexChanges>(fetchImpl, `/api/conversations${since(rev)}`),
    fetchConversation: (skey, rev) =>
      get<ConversationChanges>(
        fetchImpl,
        `/api/conversations/${encodeURIComponent(skey)}${since(rev)}`,
      ),
    fetchKeys: async (skey) => {
      const path = skey
        ? `/api/conversations/${encodeURIComponent(skey)}/keys`
        : '/api/conversations/keys'
      return (await get<{ keys: RecordKey[] }>(fetchImpl, path)).keys
    },
  }
}
