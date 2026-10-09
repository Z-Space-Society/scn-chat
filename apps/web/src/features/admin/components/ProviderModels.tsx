import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import {
  type AdminModel,
  type Capabilities,
  capabilityNames,
  noCapabilities,
} from '../lib/models.ts'
import type { AdminPlugin } from '../queries.ts'

type Provider = AdminPlugin['providers'][number]

interface Props {
  instance: AdminPlugin
  /** The plugin's options as they are in its form, saved or not, for listing models. */
  options: Record<string, unknown>
  provider: Provider
  models: AdminModel[]
}

/** A summary of a provider's admin models, each linking to its page, and the ways to add more. */
export function ProviderModels(props: Props) {
  const modelsChanged = useModelsChanged()
  const add = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$post({}, json(model))),
    onSuccess: modelsChanged,
  })
  const list = useMutation({
    mutationFn: () =>
      read(
        api.admin.plugins['list-models'].$post(
          {},
          json({
            package: props.instance.package,
            instanceId: props.instance.id,
            options: props.options,
          }),
        ),
      ),
  })
  const listed = (list.data?.models ?? []).filter((model) => model.provider === props.provider.id)
  // A model a provider lists starts with the user role and the capabilities the list reports.
  const offer = (
    model: { id: string; name: string; capabilities: Capabilities },
    options?: { onSuccess: () => void },
  ) =>
    add.mutate({ provider: props.provider.id, ...model, roles: ['user'], default: false }, options)
  const offered = new Set(props.models.map((model) => model.id))
  const form = useAppForm({
    defaultValues: { id: '' },
    onSubmit: ({ value, formApi }) => {
      const id = value.id.trim()
      offer({ id, name: id, capabilities: noCapabilities }, { onSuccess: () => formApi.reset() })
    },
  })
  return (
    <div>
      <h3>Models for {props.provider.name}</h3>
      {!props.provider.hasAdminKey && <p>Add an admin key to offer this provider's models.</p>}
      <ModelTable pluginId={props.instance.id} models={props.models} />
      {props.provider.listsModels && (
        <button type="button" onClick={() => list.mutate()}>
          Refresh model list
        </button>
      )}
      {listed.length > 0 && (
        <ul>
          {listed.map((model) => (
            <li key={model.id}>
              <label>
                <input
                  type="checkbox"
                  checked={offered.has(model.id)}
                  disabled={offered.has(model.id) || !props.provider.hasAdminKey}
                  onChange={() =>
                    offer({ id: model.id, name: model.name, capabilities: model.capabilities })
                  }
                />{' '}
                {model.name} ({model.id})
              </label>
            </li>
          ))}
        </ul>
      )}
      <form.AppForm>
        <form.Form>
          <form.AppField name="id">
            {(field) => (
              <field.TextField
                aria-label={`Model ID for ${props.provider.name}`}
                placeholder="Model ID"
                required
              />
            )}
          </form.AppField>
          <button type="submit" disabled={!props.provider.hasAdminKey}>
            Add model
          </button>
        </form.Form>
      </form.AppForm>
      <ErrorAlert error={lastError(add, list)} />
    </div>
  )
}

interface ModelTableProps {
  pluginId: string
  models: AdminModel[]
}

/** The provider's admin models, each linking to its page. */
function ModelTable(props: ModelTableProps) {
  if (props.models.length === 0) return null
  return (
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>ID</th>
          <th>Capabilities</th>
          <th>Roles</th>
          <th>Default</th>
        </tr>
      </thead>
      <tbody>
        {props.models.map((model) => (
          <tr key={model.id}>
            <td>
              <Link
                to="/admin/plugins/$id/model"
                params={{ id: props.pluginId }}
                search={{ provider: model.provider, id: model.id }}
              >
                {model.name}
              </Link>
            </td>
            <td>{model.id}</td>
            <td>{capabilityNames.filter((c) => model.capabilities[c]).join(', ')}</td>
            <td>{model.roles.join(', ')}</td>
            <td>{model.default ? 'Yes' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
