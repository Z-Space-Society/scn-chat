import type { AccessLevel } from './auth/access.ts'
import type { Account } from './auth/accounts.ts'

export type AuthUser = {
  did: string
  account: Account
  roles: string[]
  access: AccessLevel
  admin: boolean
}

/** Hono context variables shared by every route. */
export type AppEnv = { Variables: { user: AuthUser | null } }
