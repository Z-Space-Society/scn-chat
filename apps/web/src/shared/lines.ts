/** The non-blank lines of some text, trimmed, as for a list typed one item per line. */
export const splitLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
