import { createCodePlugin } from '@streamdown/code'
import type { BundledLanguage, TokensResult } from 'shiki'
import { createCssVariablesTheme } from 'shiki/core'

/*
 * Code highlighting, loaded the first time a code block renders, since Shiki and its grammars are
 * the heaviest part of rendering a reply. Each language's grammar loads when a block first names it.
 */

/** Terminal colors, for output that carries them, drawn from the code tokens. */
const ansi = {
  black: 'var(--color-code-foreground)',
  red: 'var(--color-code-token-deleted)',
  green: 'var(--color-code-token-string)',
  yellow: 'var(--color-code-token-constant)',
  blue: 'var(--color-code-token-function)',
  magenta: 'var(--color-code-token-keyword)',
  cyan: 'var(--color-code-token-link)',
  white: 'var(--color-code-token-comment)',
}

/**
 * Colors every token by a CSS variable, so the theme's `--color-code-*` tokens choose them, light
 * and dark alike, and the theme picker switches them with everything else.
 */
const theme = createCssVariablesTheme({
  name: 'scn-chat',
  variablePrefix: '--color-code-',
  variableDefaults: Object.fromEntries(
    Object.entries(ansi).flatMap(([name, color]) => [
      [`ansi-${name}`, color],
      [`ansi-bright-${name}`, color],
    ]),
  ),
})

const plugin = createCodePlugin({ themes: [theme, theme] })

/**
 * Highlight code in a language, returning the tokens at once when they are ready, or null and
 * calling `done` with them once its grammar loads. Code still streaming is highlighted from where
 * its last highlight left off, and isn't kept, since the next update replaces it.
 */
export function highlight(
  code: string,
  language: string,
  incomplete: boolean,
  done?: (result: TokensResult) => void,
): TokensResult | null {
  return plugin.highlight(
    // A language Shiki doesn't know shows as plain text.
    {
      code,
      language: language as BundledLanguage,
      isIncomplete: incomplete,
      themes: [theme, theme],
    },
    done,
  )
}
