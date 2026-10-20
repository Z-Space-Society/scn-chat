/** The lexicon's limits on a chat's tags. */
const MAX_TAGS = 32
const MAX_TAG_LENGTH = 64

/** Tags typed as a comma-separated list, trimmed, deduplicated, and within the lexicon's limits. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH))
    .filter(Boolean)
  return [...new Set(tags)].slice(0, MAX_TAGS)
}
