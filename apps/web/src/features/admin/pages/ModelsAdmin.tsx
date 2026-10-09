import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { storedModel } from '../lib/models.ts'
import { moveItem } from '../lib/reorder.ts'
import { type AdminModelEntry, adminModelsQuery } from '../queries.ts'

/** The admin models from every provider, for choosing the default and the order users see. */
export function ModelsAdmin() {
  const { data: models } = useSuspenseQuery(adminModelsQuery)
  const modelsChanged = useModelsChanged()
  const makeDefault = useMutation({
    mutationFn: (model: AdminModelEntry) =>
      read(api.admin.models.$put({}, json({ ...storedModel(model), default: true }))),
    onSuccess: modelsChanged,
  })
  const reorder = useMutation({
    mutationFn: (order: AdminModelEntry[]) =>
      read(
        api.admin.models.order.$put(
          {},
          json({ models: order.map(({ provider, id }) => ({ provider, id })) }),
        ),
      ),
    onSuccess: modelsChanged,
  })
  return (
    <section>
      <h2>Models</h2>
      <p>
        Models are added on their provider's plugin page, under{' '}
        <Link to="/admin/plugins">Plugins</Link>. Here you set the default and the order users see
        them in.
      </p>
      <ol>
        {models.map((model, index) => (
          <ModelRow
            key={`${model.provider}/${model.id}`}
            model={model}
            index={index}
            count={models.length}
            onMakeDefault={() => makeDefault.mutate(model)}
            onMove={(by) => reorder.mutate(moveItem(models, index, by))}
          />
        ))}
      </ol>
      <ErrorAlert error={lastError(makeDefault, reorder)} />
    </section>
  )
}

interface ModelRowProps {
  model: AdminModelEntry
  index: number
  count: number
  onMakeDefault: () => void
  onMove: (by: number) => void
}

function ModelRow(props: ModelRowProps) {
  const model = props.model
  return (
    <li>
      <label>
        <input
          type="radio"
          name="default-model"
          checked={model.default}
          onChange={props.onMakeDefault}
        />{' '}
        {model.name} ({model.provider}/{model.id})
      </label>{' '}
      <ReorderButtons index={props.index} count={props.count} onMove={props.onMove} />
      {model.warning && <p role="alert">{model.warning}</p>}
    </li>
  )
}
