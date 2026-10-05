import { useState } from 'react'
import type { Issue } from '../response.ts'
import { applyRule, type FieldRule } from './field-rules.ts'

export type Property = {
  type?: string
  enum?: unknown[]
  description?: string
  title?: string
  rule?: FieldRule
  default?: unknown
  multiline?: boolean
  items?: Property
  properties?: Record<string, Property>
}
export type Schema = { properties?: Record<string, Property> }

export type SchemaFieldsProps = {
  schema: Schema
  values: Record<string, unknown>
  secretFields?: string[]
  secretsSet?: string[]
  /** Offer to clear stored secrets, for forms that support it. */
  cleared?: string[]
  onClear?: (key: string, clear: boolean) => void
  /** Problems the server found, by field path. */
  issues?: Issue[]
  onChange: (key: string, value: unknown) => void
}

/** A textarea for a list of strings, one per line. */
function LinesInput({
  value,
  disabled,
  onChange,
}: {
  value: string[]
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const [text, setText] = useState(value.join('\n'))
  return (
    <textarea
      disabled={disabled}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(
          e.target.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        )
      }}
    />
  )
}

/** Inputs for a settings form, generated from its JSON schema. */
export function SchemaFields({
  schema,
  values,
  secretFields = [],
  secretsSet = [],
  cleared = [],
  onClear,
  issues = [],
  onChange,
}: SchemaFieldsProps) {
  return Object.entries(schema.properties ?? {}).map(([key, property]) => {
    const { visible, enabled } = applyRule(property.rule, values)
    if (!visible) return null
    const disabled = !enabled
    const label = property.title ?? key
    const value = values[key] ?? property.default
    const own = issues.filter((issue) => issue.path[0] === key)
    const messages = own.map((issue) => (
      <small key={`${issue.path.join('.')}:${issue.message}`} role="alert">
        {issue.message}
      </small>
    ))
    if (property.type === 'object' && property.properties) {
      return (
        <fieldset key={key}>
          <legend>{label}</legend>
          {property.description && <small>{property.description}</small>}
          <SchemaFields
            schema={property}
            values={(value ?? {}) as Record<string, unknown>}
            issues={own.map((issue) => ({ ...issue, path: issue.path.slice(1) }))}
            onChange={(field, next) =>
              onChange(key, { ...((value ?? {}) as Record<string, unknown>), [field]: next })
            }
          />
        </fieldset>
      )
    }
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
          value={value === undefined ? '' : String(value)}
          onChange={(e) =>
            onChange(key, Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber)
          }
        />
      )
    } else if (property.type === 'array' && property.items?.type === 'string') {
      input = (
        <LinesInput
          disabled={disabled}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(lines) => onChange(key, lines)}
        />
      )
    } else if (property.type === 'string' && property.multiline) {
      input = (
        <textarea
          disabled={disabled}
          value={String(value ?? '')}
          onChange={(e) => onChange(key, e.target.value)}
        />
      )
    } else if (property.type === 'string') {
      const secret = secretFields.includes(key)
      const stored = secret && secretsSet.includes(key)
      input = (
        <>
          <input
            type={secret ? 'password' : 'text'}
            disabled={disabled || cleared.includes(key)}
            value={secret ? String(values[key] ?? '') : String(value ?? '')}
            placeholder={stored ? 'Saved. Leave blank to keep.' : ''}
            onChange={(e) => onChange(key, e.target.value)}
          />
          {stored && onClear && (
            <label>
              <input
                type="checkbox"
                checked={cleared.includes(key)}
                onChange={(e) => onClear(key, e.target.checked)}
              />{' '}
              Clear
            </label>
          )}
        </>
      )
    } else {
      return (
        <p key={key}>
          {label}: <em>Unsupported setting type</em>
        </p>
      )
    }
    return (
      <div key={key}>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: every branch above sets input to a control */}
        <label>
          {label} {input}
        </label>
        {property.description && <small>{property.description}</small>}
        {messages}
      </div>
    )
  })
}
