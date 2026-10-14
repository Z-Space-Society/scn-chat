import type { ModelRef } from '@scn-chat/lexicons'
import { ChevronDownIcon } from '../../../shared/icons.tsx'
import { Select, type SelectOption } from '../../../shared/ui/Select.tsx'
import { SkeletonText } from '../../../shared/ui/Skeleton.tsx'
import { type ModelOption, modelRef, sameModel } from '../models.ts'

const keyOf = (m: ModelRef) => `${m.provider}/${m.id}`

/** The choice of no model: an option, or only what the button says while none is chosen. */
interface None {
  label: string
  /** Whether "none" can be picked, rather than only shown until something is. */
  selectable: boolean
}

interface Props {
  models: ModelOption[]
  value: ModelRef | null
  onChange: (model: ModelRef | null) => void
  none?: None
  id?: string
  'aria-label'?: string
  title?: string
  /** How the button looks: a field, or quiet text in a toolbar, as in the composer. */
  quiet?: boolean
  /** Whether the models are on their way, which holds the button with a line in place of a name. */
  loading?: boolean
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
  if (props.loading)
    return (
      <Select
        id={props.id}
        aria-label={props['aria-label']}
        title={props.title}
        quiet={props.quiet}
        className={props.className}
        options={[]}
        value=""
        onChange={() => {}}
        disabled
      >
        <SkeletonText className="w-24 min-w-0 flex-1" />
        <ChevronDownIcon className="size-3.25 in-[[data-quiet]]:text-muted-quiet text-muted" />
      </Select>
    )
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
    />
  )
}
