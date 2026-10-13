import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The theme's names that tailwind-merge can't tell apart on its own, such as text-ui, a size, from
 * text-muted, a color. A test keeps these in step with styles/theme.css.
 */
export const themeNames = {
  text: ['caption', 'small', 'ui', 'body', 'heading', 'title', 'display', 'code'],
  tracking: ['title', 'heading', 'label', 'key'],
  font: ['ui', 'prose', 'mono'],
  radius: [
    'panel',
    'card',
    'small',
    'badge',
    'row',
    'menu',
    'bubble',
    'editor',
    'mark',
    'composer',
  ],
  shadow: ['float', 'lift'],
  spacing: [
    'icon',
    'sidebar',
    'sidebar-pad',
    'row-inset',
    'drawer',
    'settings-nav',
    'row',
    'bar',
    'toggle',
    'composer-button',
    'gutter',
    'card-pad',
    'within',
    'turn',
  ],
  container: ['column', 'settings', 'narrow'],
  ease: ['out', 'swap'],
  animate: ['fade-in', 'breathe', 'panel-up'],
  breakpoint: ['wide'],
}

const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: themeNames.text,
      tracking: themeNames.tracking,
      font: themeNames.font,
      radius: themeNames.radius,
      shadow: themeNames.shadow,
      spacing: themeNames.spacing,
      container: themeNames.container,
      ease: themeNames.ease,
      animate: themeNames.animate,
      breakpoint: themeNames.breakpoint,
    },
  },
})

/** Joins class names, letting a later utility win over an earlier one of the same kind. */
export function cn(...classes: ClassValue[]) {
  return merge(clsx(classes))
}
