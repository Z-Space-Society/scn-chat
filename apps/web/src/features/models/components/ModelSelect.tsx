import type { ModelRef } from '@scn-chat/lexicons'
import { cn } from '../../../shared/cn.ts'
import { ChevronDownIcon } from '../../../shared/icons.tsx'
import { Select, type SelectOption } from '../../../shared/ui/Select.tsx'
import { type ModelOption, modelRef, sameModel } from '../models.ts'
import { type AutoEffort, effortOptions } from './EffortSelect.tsx'

const keyOf = (m: ModelRef) => `${m.provider}/${m.id}`

/** The choice of no model: an option, or only what the button says while none is chosen. */
interface None {
  label: string
  /** Whether "none" can be picked, rather than only shown until something is. */
  selectable: boolean
}

/** A thinking effort chosen from the model's list, in a submenu of its own. */
interface Effort {
  /** The chosen level, or "" for none. */
  value: string
  onChange: (value: string) => void
  /** What the option for no level is called, and who decides then. */
  auto: AutoEffort
}

interface Props {
  models: ModelOption[]
  value: ModelRef | null
  onChange: (model: ModelRef | null) => void
  none?: None
  /** An effort to choose in a submenu after the models, for a model that reasons. The button then shows both names. */
  effort?: Effort
  id?: string
  'aria-label'?: string
  title?: string
  /** How the button looks: a field, or quiet text in a toolbar, as in the composer. */
  quiet?: boolean
  className?: string
}

/** A choice among the models on offer, or none, by reference. A chosen model that is not on offer shows as unavailable. */
export function ModelSelect(props: Props) {
  const value = props.value
  const offered = !value || props.models.some((m) => sameModel(m, value))
  const options: SelectOption[] = [
    ...(props.none?.selectable ? [{ value: '', label: props.none.label }] : []),
    ...(value && !offered
      ? [{ value: keyOf(value), label: `Unavailable: ${keyOf(value)}`, disabled: true }]
      : []),
    ...props.models.map((m) => ({ value: keyOf(m), label: m.name })),
  ]
  const key = value ? keyOf(value) : ''
  const effort = props.effort
  const efforts = effort ? effortOptions(effort.auto) : []
  // Thinking off needs no word on the button, which then names the model alone.
  const chosenEffort =
    effort && effort.value !== 'none'
      ? efforts.find((option) => option.value === effort.value)
      : undefined
  const modelLabel = options.find((option) => option.value === key)?.label
  return (
    <Select
      id={props.id}
      aria-label={props['aria-label']}
      title={props.title}
      quiet={props.quiet}
      className={props.className}
      options={options}
      value={key}
      placeholder={props.none?.label}
      onChange={(next) => {
        const model = props.models.find((m) => keyOf(m) === next)
        props.onChange(model ? modelRef(model) : null)
      }}
      submenu={
        effort && {
          label: 'Thinking effort',
          options: efforts,
          value: effort.value,
          onChange: effort.onChange,
        }
      }
    >
      {chosenEffort && (
        // The model's thinking effort, after its name on the same button, as quiet as the name.
        <>
          <span className={cn('flex-1 truncate', !modelLabel && 'text-muted')}>
            {modelLabel ?? props.none?.label}
          </span>
          <span className="inline-flex items-center gap-1.25 whitespace-nowrap in-[[data-quiet][aria-expanded=true]]:text-muted in-[[data-quiet]]:text-muted-quiet text-muted before:content-['·']">
            {chosenEffort.label}
          </span>
          <ChevronDownIcon className="size-3.25 in-[[data-quiet]]:text-muted-quiet text-muted" />
        </>
      )}
    </Select>
  )
}
