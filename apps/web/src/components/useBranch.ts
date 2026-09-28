import { useCallback, useState } from 'react'
import { type BranchMessage, currentBranch } from '../lib/branch.ts'

/** The branch to show, and a way to pick another sibling at any level. */
export function useBranch(messages: BranchMessage[]) {
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const pick = useCallback(
    (parent: string | null, rkey: string) =>
      setChosen((current) => ({ ...current, [parent ?? '']: rkey })),
    [],
  )
  return { branch: currentBranch(messages, chosen), pick }
}
