/** People a conversation is shared with, as the sharing settings list them. */
export type Members = { did: string; handle: string | null }[]

/** Members as the people field shows them: handles, or DIDs without one, separated by commas. */
export const formatMembers = (members: Members) =>
  members.map((member) => member.handle ?? member.did).join(', ')

/** The handles or DIDs typed in the people field. */
export const parseMembers = (text: string) =>
  text
    .split(',')
    .map((member) => member.trim())
    .filter(Boolean)
