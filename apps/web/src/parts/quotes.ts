/** A run of a user message's lines: a quote, from lines starting with `>`, or text as written. */
export type TextBlock = { quote: boolean; text: string }

const QUOTE_LINE = /^> ?/

/**
 * A user message's text split into its quotes and the rest, so quoted lines can show as quotes
 * without rendering the rest as Markdown. Blank lines around a block are dropped.
 */
export function splitQuotes(text: string): TextBlock[] {
  const blocks: TextBlock[] = []
  for (const line of text.split('\n')) {
    const quote = QUOTE_LINE.test(line)
    const content = quote ? line.replace(QUOTE_LINE, '') : line
    const last = blocks.at(-1)
    if (last?.quote === quote) last.text += `\n${content}`
    else blocks.push({ quote, text: content })
  }
  return blocks
    .map((block) => ({ ...block, text: block.text.replace(/^\s*\n|\n\s*$/g, '') }))
    .filter((block) => block.text.trim())
}
