/*
 * Every floating menu and panel is lifted a step lighter than the panel, edged in the line between
 * the sidebar and the panel, with a soft shadow, wherever it opens. Menus hold rows like the
 * sidebar's, inside a corner that nests around theirs.
 */

/** A floating menu or panel. */
export const floating =
  'rounded-menu border-(length:--menu-edge) border-divider bg-lifted p-(--menu-pad) shadow-lift'

/** A row of a floating menu, such as an action or an option. */
export const menuRow =
  'flex min-h-row items-center gap-2.25 rounded-row px-2.25 py-1.25 text-start font-medium text-ink text-ui leading-[1.45]'
