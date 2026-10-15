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

/** How many finished blocks' tokens `highlighted` keeps, the least recently used forgotten first. */
const KEPT_BLOCKS = 200
const recent = new Map<string, TokensResult>()

function remember(key: string, result: TokensResult) {
  recent.delete(key)
  recent.set(key, result)
  if (recent.size > KEPT_BLOCKS) recent.delete(recent.keys().next().value as string)
}

/**
 * The tokens of finished code highlighted lately, or null, without starting any work, so a block
 * can be colored from its first frame when its code was highlighted before.
 */
export function highlighted(code: string, language: string): TokensResult | null {
  const key = `${language}\n${code}`
  const result = recent.get(key)
  if (result) remember(key, result)
  return result ?? null
}

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
  const keep = (result: TokensResult) => {
    if (!incomplete) remember(`${language}\n${code}`, result)
    return result
  }
  const ready = plugin.highlight(
    // A language Shiki doesn't know shows as plain text.
    {
      code,
      language: language as BundledLanguage,
      isIncomplete: incomplete,
      themes: [theme, theme],
    },
    (result) => done?.(keep(result)),
  )
  return ready && keep(ready)
}
