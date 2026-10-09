import { useNavigate, useSearch } from '@tanstack/react-router'
import { type BranchMessage, choicesFor, currentBranch } from '../lib/branch.ts'

/**
 * The branch on screen, named by the focused message in the URL's `m`: its ancestors, then the
 * newest sibling at each level below it. Picking a message focuses it, replacing `m`, so reloading
 * or sharing the URL keeps the branch. Picking leaves the scroll where it is.
 */
export function useBranch(messages: BranchMessage[]) {
  // Only `m`, so typing a search, which changes `q`, doesn't rerender the conversation.
  const focus = useSearch({ strict: false, select: (search) => search.m })
  const navigate = useNavigate()
  const pick = (rkey: string) =>
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, m: rkey }),
      replace: true,
      resetScroll: false,
    })
  const choices = focus ? choicesFor(messages, focus) : {}
  return { focus, branch: currentBranch(messages, choices), pick }
}
