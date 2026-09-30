import type {
  AuthApi,
  BlobsApi,
  PluginsApi,
  ProvidersApi,
  SharingApi,
  StorageApi,
  TurnsApi,
} from '@scn-chat/server/api-types'
import { type ClientResponse, hc } from 'hono/client'
import type { SuccessStatusCode } from 'hono/utils/http-status'
import { errorMessage } from './lib/response.ts'

/** Clients for calling the hono server's /api routes. **/
export const api = {
  auth: hc<AuthApi>('/api'),
  chats: hc<StorageApi>('/api'),
  turns: hc<TurnsApi>('/api'),
  providers: hc<ProvidersApi>('/api'),
  plugins: hc<PluginsApi>('/api/plugins'),
  blobs: hc<BlobsApi>('/api'),
  sharing: hc<SharingApi>('/api'),
}

/** Build the request options for a JSON body with api calls. */
export const json = (body: unknown) => ({
  init: { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
})

const unauthorized = new Set<() => void>()

/** Call a listener whenever a request finds the session has ended. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorized.add(listener)
  return () => unauthorized.delete(listener)
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** The body of the successful responses among a route's possible responses. */
type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, 'json'>
    ? S extends SuccessStatusCode
      ? T
      : never
    : never

/** Read a response's JSON. Throws ApiError on failure. */
export async function read<R extends ClientResponse<unknown, number, string>>(
  response: Promise<R>,
): Promise<SuccessBody<R>> {
  const res = await response
  if (res.status === 401) for (const listener of unauthorized) listener()
  if (!res.ok) {
    const message = await errorMessage(res)
    if (res.status !== 401) console.error(`Request failed: ${res.status} ${res.url}`, message)
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as SuccessBody<R>
}
