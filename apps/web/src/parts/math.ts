import { createMathPlugin } from '@streamdown/math'

/**
 * Math between `$$`, drawn by KaTeX, loaded the first time a text holds some, since KaTeX is most
 * of what rendering Markdown weighs. Its stylesheet comes with the app's, so math draws at once.
 */
export const math = createMathPlugin({ errorColor: 'var(--color-danger)' })
