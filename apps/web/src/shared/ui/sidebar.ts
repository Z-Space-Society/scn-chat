/**
 * A row of a sidebar, a link or a button, after Linear's: small one-line text on the frame that a
 * tint marks when hovered or open, rather than a card.
 */
export const sidebarRow =
  'flex min-h-row w-full items-center gap-2.25 overflow-hidden whitespace-nowrap rounded-row px-row-inset py-1.25 text-start font-medium text-ink no-underline leading-[1.45] transition-colors duration-(--dur-feedback) hover:bg-row-hover aria-[current=page]:bg-row-current aria-[current=page]:text-ink-strong [&_svg]:text-muted aria-[current=page]:[&_svg]:text-current'

/**
 * A section's heading in the sidebar, small and grey, with room above to close off the section
 * before. It scrolls with its rows, since one held at the top would sit in the list's fade.
 */
export const sectionHeading =
  'mt-4.5 mb-1 flex items-center gap-1.5 px-row-inset py-0.75 font-medium text-caption text-section-ink leading-[1.4]'

/**
 * The part of the sidebar that scrolls, between what stays put above and below it. It reaches the
 * sidebar's edges, so the scrollbar sits at the edge, and contains what is positioned inside it,
 * such as visually hidden text, which would otherwise stretch the page past the window.
 */
export const sidebarScroll =
  'scroll-fade relative -mx-sidebar-pad mt-2 min-h-0 flex-1 overflow-y-auto px-sidebar-pad pb-6'
