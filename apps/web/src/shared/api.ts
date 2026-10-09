import type {
  AdminApi,
  AuthApi,
  BlobsApi,
  PluginsApi,
  ProvidersApi,
  SharingApi,
  StorageApi,
  TurnsApi,
} from '@scn-chat/server/api-types'
import { getGlobalStartContext } from '@tanstack/react-start'
import { type ClientResponse, hc } from 'hono/client'
import type { SuccessStatusCode } from 'hono/utils/http-status'
import { errorDetails, type Issue } from './response.ts'

/**
 * Call the server: in process while rendering on the server, with the page request's session,
 * and over HTTP in the browser. The window check comes first, since outside Start's compiler, as
 * in tests, the context lookup always takes its server branch.
 */
const apiFetch: typeof fetch = (input, init) => {
  const server = typeof window === 'undefined' ? getGlobalStartContext() : undefined
  return server ? server.fetch(input, init) : fetch(input, init)
}

/** Clients for calling the hono server's /api routes. **/
export const api = {
  auth: hc<AuthApi>('/api', { fetch: apiFetch }),
  chats: hc<StorageApi>('/api', { fetch: apiFetch }),
  turns: hc<TurnsApi>('/api', { fetch: apiFetch }),
  providers: hc<ProvidersApi>('/api', { fetch: apiFetch }),
  plugins: hc<PluginsApi>('/api/plugins', { fetch: apiFetch }),
  blobs: hc<BlobsApi>('/api', { fetch: apiFetch }),
  sharing: hc<SharingApi>('/api', { fetch: apiFetch }),
  admin: hc<AdminApi>('/api/admin', { fetch: apiFetch }),
}

/** Build the request options for a JSON body with api calls. */
export const json = (body: unknown) => ({
  init: { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
})

const unauthorized = new Set<() => void>()

/** Call a listener whenever a request, or anything that reports it, finds the session has ended. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorized.add(listener)
  return () => unauthorized.delete(listener)
}

/** Tell the listeners the session has ended, as a request finding it does. */
export function reportUnauthorized() {
  for (const listener of unauthorized) listener()
}

export class ApiError extends Error {
  readonly status: number
  /** Problems with individual form fields. */
  readonly issues: Issue[]

  constructor(status: number, message: string, issues: Issue[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
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
  if (res.status === 401) reportUnauthorized()
  if (!res.ok) {
    const { message, issues } = await errorDetails(res)
    if (res.status !== 401) console.error(`Request failed: ${res.status} ${res.url}`, message)
    throw new ApiError(res.status, message, issues)
  }
  return (await res.json()) as SuccessBody<R>
}
