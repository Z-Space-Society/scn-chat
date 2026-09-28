import type { Context } from 'hono'
import type { z } from 'zod'

export class InvalidBody extends Error {
  constructor(details: string) {
    super(`Invalid request body: ${details}`)
    this.name = 'InvalidBody'
  }
}

/** Parse a JSON request body and validate it against the schema. */
export async function jsonBody<S extends z.ZodType>(
  c: Context,
  schema: S,
  options: { optional?: boolean } = {},
): Promise<z.infer<S>> {
  const text = await c.req.text()
  let raw: unknown = {}
  if (text || !options.optional) {
    try {
      raw = JSON.parse(text)
    } catch {
      throw new InvalidBody('not JSON')
    }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new InvalidBody(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
    )
  }
  return result.data
}
