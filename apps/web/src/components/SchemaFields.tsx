import { applyRule, type FieldRule } from '../lib/field-rules.ts'

type Property = {
  type?: string
  enum?: unknown[]
  description?: string
  title?: string
  rule?: FieldRule
}
type Schema = { properties?: Record<string, Property> }

export type SchemaFieldsProps = {
  schema: Schema
  values: Record<string, unknown>
  secretFields: string[]
  secretsSet: string[]
  onChange: (key: string, value: unknown) => void
}

/** Inputs for a plugin's settings, generated from its JSON schema. */
export function SchemaFields({
  schema,
  values,
  secretFields,
  secretsSet,
  onChange,
}: SchemaFieldsProps) {
  return Object.entries(schema.properties ?? {}).map(([key, property]) => {
    const { visible, enabled } = applyRule(property.rule, values)
    if (!visible) return null
    const disabled = !enabled
    const label = property.title ?? key
    const value = values[key]
    let input: React.ReactNode
    if (property.enum) {
      input = (
        <select
          disabled={disabled}
          value={String(value ?? '')}
          onChange={(e) => onChange(key, e.target.value)}
        >
          {property.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      )
    } else if (property.type === 'boolean') {
      input = (
        <input
          type="checkbox"
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(e) => onChange(key, e.target.checked)}
        />
      )
    } else if (property.type === 'number' || property.type === 'integer') {
      input = (
        <input
          type="number"
          disabled={disabled}
          value={String(value ?? '')}
          onChange={(e) => onChange(key, e.target.valueAsNumber)}
        />
      )
    } else if (property.type === 'string') {
      const secret = secretFields.includes(key)
      input = (
        <input
          type={secret ? 'password' : 'text'}
          disabled={disabled}
          value={String(value ?? '')}
          placeholder={secret && secretsSet.includes(key) ? 'Saved. Leave blank to keep.' : ''}
          onChange={(e) => onChange(key, e.target.value)}
        />
      )
    } else {
      return (
        <p key={key}>
          {label}: <em>Unsupported setting type</em>
        </p>
      )
    }
    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: every branch above sets input to a control
      <label key={key}>
        {label} {input}
        {property.description && <small>{property.description}</small>}
      </label>
    )
  })
}
