import type { dataTagSymbol } from '@tanstack/react-query'
import type { credentialsQuery } from '../queries.ts'

/** A stored key as the server lists it, without the key itself. */
export type Credential = (typeof credentialsQuery.queryKey)[typeof dataTagSymbol][number]

/** What a key is called: its name, else its endpoint's slug, else its provider's name. */
export const keyLabel = (credential: Credential, provider: string) =>
  credential.name ?? credential.slug ?? provider

/** The line under a key's name: its provider's name, and its base URL when it is an endpoint. */
export const keyDescription = (credential: Credential, provider: string) =>
  credential.baseUrl ? `${provider} · ${credential.baseUrl}` : provider
