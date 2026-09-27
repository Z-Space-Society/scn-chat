import { describe, expect, it } from 'vitest'
import { createRoles, RolesConfigError } from '../../src/auth/roles.ts'

describe('createRoles', () => {
  it('gives every user the implicit user role plus each configured role listing them', () => {
    const roles = createRoles({ staff: ['did:plc:alice'], beta: ['did:plc:alice', 'did:plc:bob'] })
    expect(roles.rolesFor('did:plc:alice')).toEqual(['user', 'staff', 'beta'])
    expect(roles.rolesFor('did:plc:carol')).toEqual(['user'])
  })

  it('refuses a role named user', () => {
    expect(() => createRoles({ user: ['did:plc:alice'] })).toThrow(RolesConfigError)
  })

  it('refuses an invalid role name, naming it', () => {
    expect(() => createRoles({ 'Bad Role': [] })).toThrow(/Bad Role/)
  })

  it('refuses an invalid DID, naming the role and entry', () => {
    expect(() => createRoles({ staff: ['alice'] })).toThrow(/staff.*"alice"/)
  })

  it('lists the defined roles', () => {
    expect([...createRoles({ staff: [] }).defined]).toEqual(['user', 'staff'])
  })
})
