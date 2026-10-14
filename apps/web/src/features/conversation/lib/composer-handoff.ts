/** What was typed into a composer's frame, for the box that takes its place. */
export interface Draft {
  text: string
  selectionStart: number
  selectionEnd: number
  /** Whether the box had the focus, so the next one takes it. */
  focused: boolean
}

/**
 * The draft the last frame left. When nothing takes the frame's place, as when the page fails to
 * load, it waits for the next composer that starts empty, since it is what the user typed.
 */
let leftDraft: Draft | null = null

/**
 * Leave what a box holds for the next to take, as a composer's frame does on giving way. A box
 * with no text and no focus leaves nothing, so it never hands on a draft left earlier.
 */
export function leaveDraft(box: HTMLTextAreaElement) {
  const focused = box.ownerDocument.activeElement === box
  leftDraft =
    box.value || focused
      ? {
          text: box.value,
          selectionStart: box.selectionStart,
          selectionEnd: box.selectionEnd,
          focused,
        }
      : null
}

/** Take what the last frame left, once. */
export function takeDraft(): Draft | null {
  const taken = leftDraft
  leftDraft = null
  return taken
}

/**
 * Show a draft in the box that takes the frame's place, with the cursor and focus as the frame had
 * them. The text goes into the box at once, before a controlled box rerenders with it, so the
 * cursor has somewhere to go.
 */
export function restoreDraft(box: HTMLTextAreaElement, draft: Draft) {
  box.value = draft.text
  if (!draft.focused) return
  box.focus()
  box.setSelectionRange(draft.selectionStart, draft.selectionEnd)
}
