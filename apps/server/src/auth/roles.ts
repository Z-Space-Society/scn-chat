import { isValidDid } from '@atproto/syntax'

export const IMPLICIT_ROLE = 'user'
const ROLE_PATTERN = /^[a-z][a-z0-9-]*$/

export class RolesConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RolesConfigError'
  }
}

export type Roles = { rolesFor(did: string): string[]; defined: ReadonlySet<string> }

/** Validate the config's roles and answer which roles a DID holds. */
export function createRoles(config: Record<string, string[]> = {}): Roles {
  for (const [role, dids] of Object.entries(config)) {
    if (role === IMPLICIT_ROLE)
      throw new RolesConfigError(
        `The role name "${IMPLICIT_ROLE}" is implicit and cannot be defined`,
      )
    if (!ROLE_PATTERN.test(role))
      throw new RolesConfigError(`Role name "${role}" must match ${ROLE_PATTERN}`)
    for (const did of dids) {
      if (!isValidDid(did))
        throw new RolesConfigError(`Role "${role}" lists an invalid DID: "${did}"`)
    }
  }
  return {
    defined: new Set([IMPLICIT_ROLE, ...Object.keys(config)]),
    rolesFor: (did) => [
      IMPLICIT_ROLE,
      ...Object.entries(config)
        .filter(([, dids]) => dids.includes(did))
        .map(([role]) => role),
    ],
  }
}
