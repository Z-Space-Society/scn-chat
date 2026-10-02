import type { Context } from 'hono'
import type { z } from 'zod'

export type Issue = { path: (string | number)[]; message: string }

export class InvalidBody extends Error {
  /** Each problem with the field it belongs to, for forms. */
  readonly issues: Issue[]

  constructor(message: string, issues: Issue[] = []) {
    super(message)
    this.name = 'InvalidBody'
    this.issues = issues
  }
}

/** Plain issues from a zod error, for responses. */
export const issuesOf = (error: z.ZodError): Issue[] =>
  error.issues.map((issue) => ({
    path: issue.path.filter((key) => typeof key !== 'symbol') as (string | number)[],
    message: issue.message,
  }))

/** Describe issues in one line, each prefixed with its field. */
export const describeIssues = (issues: Issue[], fallback = 'body') =>
  issues.map((issue) => `${issue.path.join('.') || fallback}: ${issue.message}`).join('; ')

/** Validate a value against the schema, throwing InvalidBody with every issue. */
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issues = issuesOf(result.error)
    throw new InvalidBody(describeIssues(issues), issues)
  }
  return result.data
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
      throw new InvalidBody('The request body is not JSON')
    }
  }
  return validate(schema, raw)
}
