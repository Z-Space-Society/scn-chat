import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { useModelsChanged } from '../hooks/changes.ts'
import { adminModelsQuery } from '../queries.ts'

type ModelRef = { provider: string; id: string }

/** The admin models from every provider, for choosing the default and the order users see. */
export function ModelsAdmin() {
  const query = useQuery(adminModelsQuery)
  const models = query.data ?? []
  const modelsChanged = useModelsChanged()
  const makeDefault = useMutation({
    mutationFn: ({ warning: _warning, ...model }: (typeof models)[number]) =>
      read(api.admin.models.$put({}, json({ ...model, default: true }))),
    onSuccess: modelsChanged,
  })
  const reorder = useMutation({
    mutationFn: (order: ModelRef[]) =>
      read(api.admin.models.order.$put({}, json({ models: order }))),
    onSuccess: modelsChanged,
  })
  const move = (index: number, by: number) => {
    const order = models.map(({ provider, id }) => ({ provider, id }))
    const [moved] = order.splice(index, 1)
    order.splice(index + by, 0, moved as ModelRef)
    reorder.mutate(order)
  }
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
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
              Up
            </button>{' '}
            <button
              type="button"
              disabled={index === models.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
            {model.warning && <p role="alert">{model.warning}</p>}
          </li>
        ))}
      </ol>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
