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

/** Clients for calling the hono server's /api routes. **/
export const api = {
  auth: hc<AuthApi>('/api'),
  chats: hc<StorageApi>('/api'),
  turns: hc<TurnsApi>('/api'),
  providers: hc<ProvidersApi>('/api'),
  plugins: hc<PluginsApi>('/api'),
  blobs: hc<BlobsApi>('/api'),
  sharing: hc<SharingApi>('/api'),
}

/** Build the request options for a JSON body with api calls. */
export const json = (body: unknown) => ({
  init: { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
})

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
export async function read<R extends ClientResponse<any, any, any>>(
  response: Promise<R>,
): Promise<SuccessBody<R>> {
  const res = await response
  if (!res.ok) {
    // Error bodies from a proxy may not be JSON.
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new ApiError(
      res.status,
      body.message ?? body.error ?? `Request failed with ${res.status}`,
    )
  }
  return (await res.json()) as SuccessBody<R>
}
