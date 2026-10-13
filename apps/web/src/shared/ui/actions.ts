/*
 * The quiet controls around a message, such as its actions and the button that opens its steps,
 * which stay out of the way so a reply isn't ringed with buttons.
 */

/** A worded control, tinting when hovered or open. */
export const action =
  'inline-flex cursor-pointer items-center gap-1 rounded-small border border-transparent bg-transparent px-2 py-0.75 text-caption text-muted transition-colors duration-(--dur-feedback) hover:not-disabled:bg-hover hover:not-disabled:text-ink aria-expanded:bg-hover aria-expanded:text-ink disabled:cursor-default disabled:opacity-40'

/** An icon control, square and as tall as the worded ones, a step quieter until hovered or open. */
export const iconAction =
  'inline-flex size-action cursor-pointer items-center justify-center rounded-small p-0.75 text-icon-quiet transition-colors duration-(--dur-feedback) hover:not-disabled:bg-hover hover:not-disabled:text-ink aria-expanded:bg-hover aria-expanded:text-ink disabled:cursor-default disabled:opacity-40'
