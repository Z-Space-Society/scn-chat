export type BranchMessage = { rkey: string; record: Record<string, unknown> }

const replyAttempt = (rkey: string) => Number(rkey.match(/\.r(\d+)$/)?.[1] ?? -1)

/** Oldest first: regenerations by attempt number, everything else by creation time. */
function compare(a: BranchMessage, b: BranchMessage): number {
  const attempts = replyAttempt(a.rkey) - replyAttempt(b.rkey)
  if (attempts !== 0 && replyAttempt(a.rkey) >= 0 && replyAttempt(b.rkey) >= 0) return attempts
  return (
    (a.record.createdAt as string).localeCompare(b.record.createdAt as string) ||
    a.rkey.localeCompare(b.rkey)
  )
}

/** Messages grouped by parent, each group oldest first. Messages without a known parent are roots. */
export function childrenByParent(messages: BranchMessage[]): Map<string | null, BranchMessage[]> {
  const known = new Set(messages.map((m) => m.rkey))
  const groups = new Map<string | null, BranchMessage[]>()
  for (const message of messages) {
    const recorded = message.record.parent as string | undefined
    const parent = recorded && known.has(recorded) ? recorded : null
    groups.set(parent, [...(groups.get(parent) ?? []), message])
  }
  for (const group of groups.values()) group.sort(compare)
  return groups
}

export type BranchStep = {
  message: BranchMessage
  siblings: BranchMessage[]
  index: number
  /** The key the siblings are grouped under: their parent, or null at the root. */
  parent: string | null
}

/** The branch to show: the chosen sibling at each level, or the newest when none is chosen. */
export function currentBranch(
  messages: BranchMessage[],
  chosen: Record<string, string>,
): BranchStep[] {
  const groups = childrenByParent(messages)
  const steps: BranchStep[] = []
  let parent: string | null = null
  for (;;) {
    const siblings = groups.get(parent)
    if (!siblings?.length) return steps
    const key = parent ?? ''
    const pick = siblings.findIndex((m) => m.rkey === chosen[key])
    const index = pick >= 0 ? pick : siblings.length - 1
    const message = siblings[index] as BranchMessage
    steps.push({ message, siblings, index, parent })
    parent = message.rkey
  }
}
