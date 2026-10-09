/** The defined roles' names, for choices where the `user` role, which everyone holds, means nothing. */
export const roleNames = (roles: { name: string }[]) => roles.map((role) => role.name)

/** Every role's name, `user` first, for granting something to roles. */
export const rolesWithUser = (roles: { name: string }[]) => ['user', ...roleNames(roles)]
