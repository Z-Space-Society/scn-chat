/** What was typed into a composer's frame, for the box that takes its place. */
export interface FrameText {
  text: string
  selectionStart: number
  selectionEnd: number
  /** Whether the box had the focus, so the next one takes it. */
  focused: boolean
}

/**
 * The text the last frame left. When nothing takes the frame's place, as when the page fails to
 * load, it waits for the next composer that starts empty, since it is what the user typed.
 */
let leftText: FrameText | null = null

/**
 * Leave what a box holds for the next to take, as a composer's frame does on giving way. A box
 * with no text and no focus leaves nothing, so it never hands on text left earlier.
 */
export function leaveText(box: HTMLTextAreaElement) {
  const focused = box.ownerDocument.activeElement === box
  leftText =
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
export function takeText(): FrameText | null {
  const taken = leftText
  leftText = null
  return taken
}

/**
 * Show the text a frame left in the box that takes the frame's place, with the cursor and focus as the frame had
 * them. The text goes into the box at once, before a controlled box rerenders with it, so the
 * cursor has somewhere to go.
 */
export function restoreText(box: HTMLTextAreaElement, text: FrameText) {
  box.value = text.text
  if (!text.focused) return
  box.focus()
  box.setSelectionRange(text.selectionStart, text.selectionEnd)
}
