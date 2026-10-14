import type { Part } from './types.ts'

/** Where one tool call stands, which its row, badge, timer, and the live line all read. */
export type ToolStatus = 'running' | 'done' | 'error' | 'incomplete'

/**
 * A call's status from its result and the message that made it. A call with no result is running
 * while its message is still being written, and incomplete once the message stopped, failed, or
 * finished without one.
 */
export function toolStatus(result: Part | undefined, record: Record<string, unknown>): ToolStatus {
  if (result) return result.isError ? 'error' : 'done'
  return record.status === 'pending' ? 'running' : 'incomplete'
}
