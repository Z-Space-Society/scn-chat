import { useState } from 'react'

type Property = { type?: string; enum?: unknown[]; description?: string; title?: string }
type Schema = { properties?: Record<string, Property> }

export type SchemaFormProps = {
  schema: Schema
  values: Record<string, unknown>
  secretFields: string[]
  secretsSet: string[]
  onSubmit: (values: Record<string, unknown>) => void
}

/** A form for a plugin's settings, generated from its JSON schema. */
export function SchemaForm({
  schema,
  values,
  secretFields,
  secretsSet,
  onSubmit,
}: SchemaFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(values)
  const set = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }))
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(draft)
      }}
    >
      {Object.entries(schema.properties ?? {}).map(([key, property]) => {
        const label = property.title ?? key
        const value = draft[key]
        let input: React.ReactNode
        if (property.enum) {
          input = (
            <select value={String(value ?? '')} onChange={(e) => set(key, e.target.value)}>
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
              checked={Boolean(value)}
              onChange={(e) => set(key, e.target.checked)}
            />
          )
        } else if (property.type === 'number' || property.type === 'integer') {
          input = (
            <input
              type="number"
              value={String(value ?? '')}
              onChange={(e) => set(key, e.target.valueAsNumber)}
            />
          )
        } else if (property.type === 'string') {
          const secret = secretFields.includes(key)
          input = (
            <input
              type={secret ? 'password' : 'text'}
              value={String(value ?? '')}
              placeholder={secret && secretsSet.includes(key) ? 'Saved. Leave blank to keep.' : ''}
              onChange={(e) => set(key, e.target.value)}
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
      })}
      <button type="submit">Save</button>
    </form>
  )
}
