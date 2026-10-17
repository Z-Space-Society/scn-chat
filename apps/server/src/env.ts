import type { AccessLevel } from './auth/access.ts'
import type { Account } from './auth/accounts.ts'

export type AuthUser = {
  did: string
  account: Account
  roles: string[]
  access: AccessLevel
  admin: boolean
}

/** The API key a request was made with, on routes opened to keys. */
export type ApiKeyCaller = { id: string; label: string }

/** Hono context variables shared by every route. */
export type AppEnv = { Variables: { user: AuthUser | null; apiKey?: ApiKeyCaller } }
