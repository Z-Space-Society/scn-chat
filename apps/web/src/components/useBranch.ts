import { useCallback, useState } from 'react'
import { type BranchMessage, choicesFor, currentBranch } from '../lib/branch.ts'

/** The branch to show, and a way to pick another sibling at any level. A focused message starts on the branch. */
export function useBranch(messages: BranchMessage[], focus?: string | null) {
  const [chosen, setChosen] = useState<{ focus?: string | null; picks: Record<string, string> }>({
    focus,
    picks: {},
  })
  // Opening a different message starts over from its branch.
  if (chosen.focus !== focus) setChosen({ focus, picks: {} })
  const pick = useCallback(
    (parent: string | null, rkey: string) =>
      setChosen((current) => ({ ...current, picks: { ...current.picks, [parent ?? '']: rkey } })),
    [],
  )
  const choices = focus ? { ...choicesFor(messages, focus), ...chosen.picks } : chosen.picks
  return { branch: currentBranch(messages, choices), pick }
}
