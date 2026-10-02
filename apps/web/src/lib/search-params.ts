/**
 * The router parses search values as JSON, so a value like `2024` arrives as a number. Text
 * params take either, and drop anything else or empty.
 */
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) || undefined : undefined

/** `q` is the sidebar search, on every chat route. */
export const validateChatListSearch = (search: Record<string, unknown>): { q?: string } => {
  const q = text(search.q)
  return q ? { q } : {}
}

/** `m` names the focused message, which picks the branch on screen. */
export const validateBranchSearch = (search: Record<string, unknown>): { m?: string } => {
  const m = text(search.m)
  return m ? { m } : {}
}
