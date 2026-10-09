import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { ReorderButtons } from '../components/ReorderButtons.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { storedModel } from '../lib/models.ts'
import { moveItem } from '../lib/reorder.ts'
import { type AdminModelEntry, adminModelsQuery } from '../queries.ts'

/** The admin models from every provider, for choosing the default and the order users see. */
export function ModelsAdmin() {
  const query = useQuery(adminModelsQuery)
  const models = query.data ?? []
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
  const error = lastError(makeDefault, reorder) ?? (query.error && messageOf(query.error))
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
          <li key={`${model.provider}/${model.id}`}>
            <label>
              <input
                type="radio"
                name="default-model"
                checked={model.default}
                onChange={() => makeDefault.mutate(model)}
              />{' '}
              {model.name} ({model.provider}/{model.id})
            </label>{' '}
            <ReorderButtons
              index={index}
              count={models.length}
              onMove={(by) => reorder.mutate(moveItem(models, index, by))}
            />
            {model.warning && <p role="alert">{model.warning}</p>}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
