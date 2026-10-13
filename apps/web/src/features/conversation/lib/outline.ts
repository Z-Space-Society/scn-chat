import { messageText } from '../../../store/core.ts'
import type { BranchStep } from './branch.ts'

/** One of the user's messages on the branch, to jump to. */
export type OutlineEntry = {
  rkey: string
  text: string
}

/** The user's messages on the branch, oldest first. */
export function outlineOf(branch: BranchStep[]): OutlineEntry[] {
  return branch.flatMap((step) => {
    const record = step.message.record
    if (record.role !== 'user') return []
    return [{ rkey: step.message.rkey, text: messageText(record) }]
  })
}
