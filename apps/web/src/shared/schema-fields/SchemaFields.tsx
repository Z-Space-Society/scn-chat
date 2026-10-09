import { useState } from 'react'
import { splitLines } from '../lines.ts'
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

/** The string fields that hold secrets, which show as password inputs. */
export interface Secrets {
  fields: string[]
  /** The secret fields with a value already saved, which a blank input keeps. */
  stored?: string[]
  /** Offer to clear stored secrets, for forms that support it. */
  clearing?: { cleared: string[]; onClear: (key: string, clear: boolean) => void }
}

export interface SchemaFieldsProps {
  schema: Schema
  values: Record<string, unknown>
  secrets?: Secrets
  /** Problems the server found, by field path. */
  issues?: Issue[]
  onChange: (key: string, value: unknown) => void
}

/** Inputs for a settings form, generated from its JSON schema. */
export function SchemaFields(props: SchemaFieldsProps) {
  return (
    <>
      {Object.entries(props.schema.properties ?? {}).map(([key, property]) => (
        <SchemaField
          key={key}
          name={key}
          property={property}
          values={props.values}
          secrets={props.secrets}
          issues={props.issues}
          onChange={props.onChange}
        />
      ))}
    </>
  )
}

/** The input a property's schema calls for, or none for a type these fields don't support. */
function inputKind(property: Property) {
  if (property.enum) return 'select'
  if (property.type === 'boolean') return 'checkbox'
  if (property.type === 'number' || property.type === 'integer') return 'number'
  if (property.type === 'array' && property.items?.type === 'string') return 'lines'
  if (property.type === 'string' && property.multiline) return 'textarea'
  if (property.type === 'string') return 'text'
  return null
}

interface SchemaFieldProps extends Omit<SchemaFieldsProps, 'schema'> {
  name: string
  property: Property
}

/** One property's input, label, description, and issues, or a nested group for an object. */
function SchemaField(props: SchemaFieldProps) {
  const property = props.property
  const { visible, enabled } = applyRule(property.rule, props.values)
  if (!visible) return null
  const label = property.title ?? props.name
  const value = props.values[props.name] ?? property.default
  const own = (props.issues ?? []).filter((issue) => issue.path[0] === props.name)
  if (property.type === 'object' && property.properties) {
    const values = (value ?? {}) as Record<string, unknown>
    return (
      <fieldset>
        <legend>{label}</legend>
        {property.description && <small>{property.description}</small>}
        <SchemaFields
          schema={property}
          values={values}
          issues={own.map((issue) => ({ ...issue, path: issue.path.slice(1) }))}
          onChange={(field, next) => props.onChange(props.name, { ...values, [field]: next })}
        />
      </fieldset>
    )
  }
  const kind = inputKind(property)
  if (!kind)
    return (
      <p>
        {label}: <em>Unsupported setting type</em>
      </p>
    )
  return (
    <div>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: SchemaInput renders a control for every kind */}
      <label>
        {label}{' '}
        <SchemaInput
          kind={kind}
          name={props.name}
          property={property}
          value={value}
          disabled={!enabled}
          values={props.values}
          secrets={props.secrets}
          onChange={props.onChange}
        />
      </label>
      {property.description && <small>{property.description}</small>}
      {own.map((issue) => (
        <small key={`${issue.path.join('.')}:${issue.message}`} role="alert">
          {issue.message}
        </small>
      ))}
    </div>
  )
}

interface SchemaInputProps extends Pick<SchemaFieldsProps, 'values' | 'secrets' | 'onChange'> {
  kind: NonNullable<ReturnType<typeof inputKind>>
  name: string
  property: Property
  /** The field's value, or its default. */
  value: unknown
  disabled: boolean
}

function SchemaInput(props: SchemaInputProps) {
  const change = (next: unknown) => props.onChange(props.name, next)
  switch (props.kind) {
    case 'select':
      return (
        <select
          disabled={props.disabled}
          value={String(props.value ?? '')}
          onChange={(e) => change(e.target.value)}
        >
          {(props.property.enum ?? []).map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      )
    case 'checkbox':
      return (
        <input
          type="checkbox"
          disabled={props.disabled}
          checked={Boolean(props.value)}
          onChange={(e) => change(e.target.checked)}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          disabled={props.disabled}
          value={props.value === undefined ? '' : String(props.value)}
          onChange={(e) =>
            change(Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber)
          }
        />
      )
    case 'lines':
      return (
        <LinesInput
          disabled={props.disabled}
          value={Array.isArray(props.value) ? (props.value as string[]) : []}
          onChange={change}
        />
      )
    case 'textarea':
      return (
        <textarea
          disabled={props.disabled}
          value={String(props.value ?? '')}
          onChange={(e) => change(e.target.value)}
        />
      )
    case 'text':
      return <TextInput {...props} />
  }
}

/** A text input, or a password input with an optional Clear for a secret. */
function TextInput(props: SchemaInputProps) {
  const clearing = props.secrets?.clearing
  const cleared = (clearing?.cleared ?? []).includes(props.name)
  const secret = (props.secrets?.fields ?? []).includes(props.name)
  const stored = secret && (props.secrets?.stored ?? []).includes(props.name)
  return (
    <>
      <input
        type={secret ? 'password' : 'text'}
        disabled={props.disabled || cleared}
        value={String((secret ? props.values[props.name] : props.value) ?? '')}
        placeholder={stored ? 'Saved. Leave blank to keep.' : ''}
        onChange={(e) => props.onChange(props.name, e.target.value)}
      />
      {stored && clearing && (
        <label>
          <input
            type="checkbox"
            checked={cleared}
            onChange={(e) => clearing.onClear(props.name, e.target.checked)}
          />{' '}
          Clear
        </label>
      )}
    </>
  )
}

interface LinesInputProps {
  value: string[]
  disabled: boolean
  onChange: (value: string[]) => void
}

/**
 * A textarea for a list of strings, one per line. It keeps its own text, so blank lines stay
 * while typing.
 */
function LinesInput(props: LinesInputProps) {
  const [text, setText] = useState(props.value.join('\n'))
  return (
    <textarea
      disabled={props.disabled}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        props.onChange(splitLines(e.target.value))
      }}
    />
  )
}
