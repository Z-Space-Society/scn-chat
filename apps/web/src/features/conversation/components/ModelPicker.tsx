import type { ModelRef } from '@scn-chat/lexicons'
import { EffortSelect, ModelSelect } from '../../models/components/ModelSelect.tsx'
import type { ModelOption } from '../../models/models.ts'

interface Props {
  models: ModelOption[]
  /** The model the server falls back to when none is chosen: null when there is none. */
  fallback: ModelRef | null | undefined
  model: ModelRef | null
  onModelChange: (model: ModelRef | null) => void
  /** Whether to offer an effort, for a model that reasons. */
  reasons: boolean
  effort: string
  onEffortChange: (effort: string) => void
}

/** The composer's choice of model, and of effort for a model that reasons. */
export function ModelPicker(props: Props) {
  return (
    <>
      <ModelSelect
        aria-label="Model"
        models={props.models}
        value={props.model}
        onChange={props.onModelChange}
      >
        <NoModelOption fallback={props.fallback} />
      </ModelSelect>
      {props.reasons && (
        <EffortSelect aria-label="Effort" value={props.effort} onChange={props.onEffortChange}>
          <option value="">Default effort</option>
        </EffortSelect>
      )}
    </>
  )
}

interface NoModelOptionProps {
  fallback: ModelRef | null | undefined
}

/** The option for choosing no model: the default, or a prompt when there is no default. */
function NoModelOption(props: NoModelOptionProps) {
  if (props.fallback === null)
    return (
      <option value="" disabled>
        Choose a model
      </option>
    )
  return <option value="">Default model</option>
}
