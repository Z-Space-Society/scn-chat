import { SpacePermission } from '@atproto/oauth-scopes'
import { nsid } from '@scn-chat/lexicons'
import { describe, expect, it } from 'vitest'
import { buildScope, scopeAllowsSpaces } from '../../src/auth/scope.ts'

const did = 'did:plc:alice'

describe('buildScope', () => {
  it('includes the permission set by default, with its NSID from the lexicon module', () => {
    expect(buildScope('permission-set')).toBe(`atproto include:${nsid.permissions}`)
  })

  it('builds raw space and blob scopes that parse as valid permissions', () => {
    const parts = buildScope('raw').split(' ')
    expect(parts[0]).toBe('atproto')
    expect(parts).toContain('blob:*/*')
    const spaces = parts.filter((part) => part.startsWith('space:'))
    expect(spaces).toHaveLength(3)
    for (const scope of spaces) expect(SpacePermission.fromString(scope), scope).not.toBeNull()
  })
})

describe('scopeAllowsSpaces', () => {
  it('is true for the raw scope on the user own DID', () => {
    expect(scopeAllowsSpaces(buildScope('raw'), did)).toBe(true)
  })

  it('is false when the PDS dropped the space permissions', () => {
    expect(scopeAllowsSpaces('atproto blob:*/*', did)).toBe(false)
  })

  it('is false for a conversation permission scoped to someone else', () => {
    expect(
      scopeAllowsSpaces(
        `atproto space:${nsid.conversation}?authority=did:plc:bob&manage=create`,
        did,
      ),
    ).toBe(false)
  })

  it('throws on a space permission it cannot parse', () => {
    expect(() => scopeAllowsSpaces('atproto space:not a permission', did)).toThrow(/cannot read/)
  })
})
