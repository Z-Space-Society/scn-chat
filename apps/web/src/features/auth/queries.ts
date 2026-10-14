import { queryOptions } from '@tanstack/react-query'
import { api, read } from '../../shared/api.ts'

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => read(api.auth.me.$get()),
})

/** The signed-in user's public profile, read from their PDS through the server. */
export const profileQuery = queryOptions({
  queryKey: ['me', 'profile'],
  queryFn: () => read(api.auth.me.profile.$get()),
  staleTime: 5 * 60_000,
})

/**
 * Bluesky's public typeahead, which the sign-in field asks from the browser. It is Bluesky's
 * method, not this app's lexicons, so it is named here rather than in the generated module.
 */
const ACCOUNT_SEARCH = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead'

export interface AccountMatch {
  did: string
  handle: string
  displayName?: string
  /** The avatar's thumbnail on Bluesky's CDN. */
  avatar?: string
}

/** Accounts whose handle or name starts with what was typed, as Bluesky has indexed them. */
export const accountSearchQuery = (term: string) =>
  queryOptions({
    queryKey: ['account-search', term],
    queryFn: async ({ signal }) => {
      const url = `${ACCOUNT_SEARCH}?${new URLSearchParams({ q: term, limit: '5' })}`
      const response = await fetch(url, { signal, referrerPolicy: 'no-referrer' })
      if (!response.ok) throw new Error(`Account search answered ${response.status}`)
      const body = (await response.json()) as { actors?: AccountMatch[] }
      return (body.actors ?? [])
        .filter((actor) => actor.handle !== 'handle.invalid')
        .map((actor) => ({
          ...actor,
          // The list shows avatars small, so it loads the thumbnail rather than the full upload.
          avatar: actor.avatar?.replace('/img/avatar/', '/img/avatar_thumbnail/'),
        }))
    },
    staleTime: 60_000,
  })
