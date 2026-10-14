import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { type BranchMessage, choicesFor, currentBranch } from '../lib/branch.ts'

/**
 * The branch on screen, named by the focused message in the URL's `m`: its ancestors, then the
 * newest sibling at each level below it. A message focused by the URL, as from a link or a search
 * result, is scrolled to once it is on screen. Picking a message focuses it, replacing `m`, so
 * reloading or sharing the URL keeps the branch, and leaves the scroll where it is, as switching
 * siblings or starting a turn wants.
 */
export function useBranch(messages: BranchMessage[]) {
  // Only `m`, so typing a search, which changes `q`, doesn't rerender the conversation.
  const focus = useSearch({ strict: false, select: (search) => search.m })
  const navigate = useNavigate()
  const choices = focus ? choicesFor(messages, focus) : {}
  const branch = currentBranch(messages, choices)
  // The focus last scrolled to, or picked here, which needs no scrolling.
  const scrolledTo = useRef<string | null>(null)
  const shown = branch.some((step) => step.message.rkey === focus)
  useEffect(() => {
    if (!focus || !shown || scrolledTo.current === focus) return
    scrolledTo.current = focus
    document.getElementById(`m-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, shown])
  const pick = (rkey: string) => {
    scrolledTo.current = rkey
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, m: rkey }),
      replace: true,
      resetScroll: false,
    })
  }
  return { focus, branch, pick }
}
