/** Shorten an error message and remove anything that looks like a secret. */
export function safeErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  return raw
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]')
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[redacted]')
    .slice(0, 500)
}
