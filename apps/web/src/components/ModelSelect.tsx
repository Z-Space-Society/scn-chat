import type { ModelRef } from '@scn-chat/lexicons'
import type { ComponentProps } from 'react'
import { effortLevels, type ModelOption, sameModel } from '../lib/models.ts'

type SelectProps = Omit<ComponentProps<'select'>, 'value' | 'onChange'>

const keyOf = (m: ModelRef) => `${m.provider}/${m.id}`

/**
 * A choice among the models on offer, or none. The children are the option for no model, with
 * value "". A chosen model that is not on offer shows as unavailable.
 */
export function ModelSelect({
  models,
  value,
  onChange,
  children,
  ...props
}: SelectProps & {
  models: ModelOption[]
  value: ModelRef | null
  onChange: (model: ModelOption | null) => void
}) {
  const offered = !value || models.some((m) => sameModel(m, value))
  return (
    <select
      {...props}
      value={value ? keyOf(value) : ''}
      onChange={(e) => onChange(models.find((m) => keyOf(m) === e.target.value) ?? null)}
    >
      {children}
      {!offered && (
        <option value={keyOf(value)} disabled>
          Unavailable: {keyOf(value)}
        </option>
      )}
      {models.map((m) => (
        <option key={keyOf(m)} value={keyOf(m)}>
          {m.name}
        </option>
      ))}
    </select>
  )
}

/** A choice of reasoning effort. The children are the option for no effort, with value "". */
export function EffortSelect({
  value,
  onChange,
  children,
  ...props
}: SelectProps & { value: string; onChange: (value: string) => void }) {
  return (
    <select {...props} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
      {effortLevels.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  )
}
