import type { ModelRef } from '@scn-chat/lexicons'
import type { ComponentProps } from 'react'
import { effortLevels, type ModelOption, modelRef, sameModel } from '../models.ts'

const keyOf = (m: ModelRef) => `${m.provider}/${m.id}`

interface ModelSelectProps extends Omit<ComponentProps<'select'>, 'value' | 'onChange'> {
  models: ModelOption[]
  value: ModelRef | null
  onChange: (model: ModelRef | null) => void
}

/**
 * A choice among the models on offer, or none, by reference. The children are the option for no
 * model, with value "". A chosen model that is not on offer shows as unavailable.
 */
export function ModelSelect(props: ModelSelectProps) {
  const { models, value, onChange, children, ...select } = props
  const offered = !value || models.some((m) => sameModel(m, value))
  return (
    <select
      {...select}
      value={value ? keyOf(value) : ''}
      onChange={(e) => {
        const model = models.find((m) => keyOf(m) === e.target.value)
        onChange(model ? modelRef(model) : null)
      }}
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

interface EffortSelectProps extends Omit<ComponentProps<'select'>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
}

/** A choice of reasoning effort. The children are the option for no effort, with value "". */
export function EffortSelect(props: EffortSelectProps) {
  const { value, onChange, children, ...select } = props
  return (
    <select {...select} value={value} onChange={(e) => onChange(e.target.value)}>
      {children}
      {effortLevels.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  )
}
