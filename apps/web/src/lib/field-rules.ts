/** A JSON Forms rule on a settings field. See https://jsonforms.io/docs/uischema/rules. */
export type FieldRule = {
  effect: 'SHOW' | 'HIDE' | 'ENABLE' | 'DISABLE'
  condition: { scope: string; schema: Record<string, unknown>; failWhenUndefined?: boolean }
}

class UnsupportedRule extends Error {}

/** Test a value against the subset of JSON Schema that conditions support. */
function matches(schema: Record<string, unknown>, value: unknown): boolean {
  return Object.entries(schema).every(([keyword, expected]) => {
    switch (keyword) {
      case 'const':
        return value === expected
      case 'enum':
        return (expected as unknown[]).includes(value)
      case 'not':
        return !matches(expected as Record<string, unknown>, value)
      case 'minLength':
        return typeof value !== 'string' || value.length >= (expected as number)
      default:
        throw new UnsupportedRule(`unsupported condition keyword "${keyword}"`)
    }
  })
}

function conditionHolds(rule: FieldRule, values: Record<string, unknown>): boolean {
  const field = /^#\/properties\/([^/]+)$/.exec(rule.condition.scope)?.[1]
  if (!field) throw new UnsupportedRule(`unsupported scope "${rule.condition.scope}"`)
  const value = values[field]
  if (value === undefined) return !rule.condition.failWhenUndefined
  return matches(rule.condition.schema, value)
}

function effectOf(rule: FieldRule, holds: boolean): { visible: boolean; enabled: boolean } {
  switch (rule.effect) {
    case 'SHOW':
      return { visible: holds, enabled: true }
    case 'HIDE':
      return { visible: !holds, enabled: true }
    case 'ENABLE':
      return { visible: true, enabled: holds }
    case 'DISABLE':
      return { visible: true, enabled: !holds }
    default:
      throw new UnsupportedRule(`unsupported effect "${String(rule.effect)}"`)
  }
}

/** Whether a field is shown and enabled under its rule. A rule this app can't read is ignored. */
export function applyRule(
  rule: FieldRule | undefined,
  values: Record<string, unknown>,
): { visible: boolean; enabled: boolean } {
  if (!rule) return { visible: true, enabled: true }
  try {
    return effectOf(rule, conditionHolds(rule, values))
  } catch (err) {
    if (!(err instanceof UnsupportedRule)) throw err
    console.warn(`Ignoring a settings field rule: ${err.message}`)
    return { visible: true, enabled: true }
  }
}
