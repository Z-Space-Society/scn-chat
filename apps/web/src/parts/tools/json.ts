/** A tool's input or output parsed from its JSON text, or undefined when it isn't JSON. */
export function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
