import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback } from 'react'
import { type BranchMessage, choicesFor, currentBranch } from '../lib/branch.ts'

/**
 * The branch on screen, named by the focused message in the URL's `m`: its ancestors, then the
 * newest sibling at each level below it. Picking a message focuses it, replacing `m`, so reloading
 * or sharing the URL keeps the branch. Picking leaves the scroll where it is.
 */
export function useBranch(messages: BranchMessage[]) {
  const focus = useSearch({ strict: false }).m
  const navigate = useNavigate()
  const pick = useCallback(
    (rkey: string) =>
      void navigate({
        to: '.',
        search: (prev) => ({ ...prev, m: rkey }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  )
  const choices = focus ? choicesFor(messages, focus) : {}
  return { focus, branch: currentBranch(messages, choices), pick }
}
