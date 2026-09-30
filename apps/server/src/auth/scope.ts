import { ScopePermissions, SpacePermission } from '@atproto/oauth-scopes'
import { nsid } from '@scn-chat/lexicons'

export type ScopeMode = 'permission-set' | 'raw'

const recordActions = ['read', 'create', 'update', 'delete'].map((action) => `action=${action}`)
const manageOps = ['create', 'update', 'delete'].map((op) => `manage=${op}`)

function spaceScope(type: string, params: string[]): string {
  return `space:${type}?${params.join('&')}`
}

const BLOBS = 'blob:*/*'

/** The OAuth scope the app requests, built from the lexicon module. */
export function buildScope(mode: ScopeMode): string {
  // PDSs drop blob permissions from permission sets, so blobs are requested alongside.
  if (mode === 'permission-set') return `atproto include:${nsid.permissions} ${BLOBS}`
  return [
    'atproto',
    spaceScope(nsid.conversation, [
      `collection=${nsid.info}`,
      `collection=${nsid.message}`,
      ...recordActions,
      ...manageOps,
    ]),
    spaceScope(nsid.conversation, ['authority=*', 'action=read']),
    spaceScope(nsid.settings, [
      'skey=self',
      `collection=${nsid.preferences}`,
      `collection=${nsid.conversationRef}`,
      ...recordActions,
      ...manageOps,
    ]),
    BLOBS,
  ].join(' ')
}

/** Does a granted scope let the user create their own conversation spaces? */
export function scopeAllowsSpaces(scope: string, did: string): boolean {
  const resolved = scope
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      if (!part.startsWith('space:')) return part
      const permission = SpacePermission.fromString(part)
      if (!permission)
        throw new Error(`The PDS granted a space permission this app cannot read: ${part}`)
      return permission.withResolvedAuthority(did as `did:${string}:${string}`).toString()
    })
  return new ScopePermissions(resolved).allowsSpace({
    type: nsid.conversation,
    authority: did,
    skey: 'self',
    manage: 'create',
  })
}
