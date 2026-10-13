import { type ReactNode, useId, useState } from 'react'
import { cn } from '../cn.ts'
import { splitLines } from '../lines.ts'
import type { Issue } from '../response.ts'
import { field, Switch } from '../ui/controls.tsx'
import { dividedRows, SettingRow } from '../ui/SettingsPage.tsx'
import { applyRule, type FieldRule } from './field-rules.ts'

export type Property = {
  type?: string
  enum?: unknown[]
  description?: string
  title?: string
  rule?: FieldRule
  default?: unknown
  multiline?: boolean
  /** What a number counts, such as "seconds", shown after its field. */
  unit?: string
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

/**
 * Inputs for a settings form, generated from its JSON schema, as rows of a settings card: an on/off
 * setting as a switch beside its label, a choice, number, or short text beside it, and a secret,
 * list, or long text under it.
 */
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
  if (property.type === 'boolean') return 'switch'
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

/** One property as a row, with its description and issues, or a nested object as a titled set of rows. */
function SchemaField(props: SchemaFieldProps) {
  const id = useId()
  const property = props.property
  const { visible, enabled } = applyRule(property.rule, props.values)
  if (!visible) return null
  const label = property.title ?? props.name
  const value = props.values[props.name] ?? property.default
  const own = (props.issues ?? []).filter((issue) => issue.path[0] === props.name)
  if (property.type === 'object' && property.properties) {
    const values = (value ?? {}) as Record<string, unknown>
    return (
      <fieldset className="min-w-0">
        {/* The legend floats, so it lays out as the group's first row rather than in its edge. */}
        <legend className="float-start w-full px-card-pad pt-card-pad">
          <span className="block font-medium text-ink-strong">{label}</span>
          {property.description && (
            <small className="mt-0.5 block text-muted text-small leading-[1.45]">
              {property.description}
            </small>
          )}
        </legend>
        <div className={cn('clear-both', dividedRows)}>
          <SchemaFields
            schema={property}
            values={values}
            issues={own.map((issue) => ({ ...issue, path: issue.path.slice(1) }))}
            onChange={(field, next) => props.onChange(props.name, { ...values, [field]: next })}
          />
        </div>
      </fieldset>
    )
  }
  const kind = inputKind(property)
  if (!kind) return <SettingRow label={label} description="Unsupported setting type" />
  const secret = kind === 'text' && (props.secrets?.fields ?? []).includes(props.name)
  const stored = secret && (props.secrets?.stored ?? []).includes(props.name)
  const note = stored ? 'Leave blank to keep the saved value.' : undefined
  return (
    <SettingRow
      label={label}
      htmlFor={id}
      description={
        (property.description || note) && [property.description, note].filter(Boolean).join(' ')
      }
      issues={own.map((issue) => (
        <small
          key={`${issue.path.join('.')}:${issue.message}`}
          role="alert"
          className="mt-0.75 block text-danger text-small"
        >
          {issue.message}
        </small>
      ))}
      // A list, long text, or secret takes the row under its label, with room for a secret's Clear.
      wide={kind === 'lines' || kind === 'textarea' || secret}
    >
      <SchemaInput
        id={id}
        kind={kind}
        name={props.name}
        property={property}
        value={value}
        disabled={!enabled}
        values={props.values}
        secrets={props.secrets}
        onChange={props.onChange}
      />
    </SettingRow>
  )
}

interface SchemaInputProps extends Pick<SchemaFieldsProps, 'values' | 'secrets' | 'onChange'> {
  id: string
  kind: NonNullable<ReturnType<typeof inputKind>>
  name: string
  property: Property
  /** The field's value, or its default. */
  value: unknown
  disabled: boolean
}

function SchemaInput(props: SchemaInputProps): ReactNode {
  const change = (next: unknown) => props.onChange(props.name, next)
  switch (props.kind) {
    case 'select':
      return (
        <select
          id={props.id}
          className={cn(field, 'min-w-52')}
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
    case 'switch':
      return (
        <Switch
          id={props.id}
          disabled={props.disabled}
          checked={Boolean(props.value)}
          onChange={(e) => change(e.target.checked)}
        />
      )
    case 'number':
      return (
        <span className="inline-flex items-center gap-2">
          <input
            id={props.id}
            type="number"
            className={cn(field, 'w-28')}
            disabled={props.disabled}
            value={props.value === undefined ? '' : String(props.value)}
            onChange={(e) =>
              change(Number.isNaN(e.target.valueAsNumber) ? undefined : e.target.valueAsNumber)
            }
          />
          {/* Always there, so a card's number fields line up once any of them has a unit. */}
          <span
            data-unit
            className="text-muted text-small empty:hidden group-has-[[data-unit]:not(:empty)]/card:inline group-has-[[data-unit]:not(:empty)]/card:min-w-14.5"
          >
            {props.property.unit}
          </span>
        </span>
      )
    case 'lines':
      return (
        <LinesInput
          id={props.id}
          disabled={props.disabled}
          value={Array.isArray(props.value) ? (props.value as string[]) : []}
          onChange={change}
        />
      )
    case 'textarea':
      return (
        <textarea
          id={props.id}
          className={field}
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
  const input = (
    <input
      id={props.id}
      type={secret ? 'password' : 'text'}
      className={cn(field, secret && 'min-w-0 flex-1')}
      disabled={props.disabled || cleared}
      value={String((secret ? props.values[props.name] : props.value) ?? '')}
      placeholder={stored ? 'Saved' : ''}
      onChange={(e) => props.onChange(props.name, e.target.value)}
    />
  )
  if (!secret) return input
  return (
    <span className="flex w-full items-center gap-3">
      {input}
      {stored && clearing && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-muted text-small">
          <input
            type="checkbox"
            className="m-0 accent-accent"
            checked={cleared}
            onChange={(e) => clearing.onClear(props.name, e.target.checked)}
          />
          Clear
        </label>
      )}
    </span>
  )
}

interface LinesInputProps {
  id: string
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
      id={props.id}
      className={field}
      disabled={props.disabled}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        props.onChange(splitLines(e.target.value))
      }}
    />
  )
}
