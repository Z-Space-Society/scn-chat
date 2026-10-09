import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { issuesOf, lastError, messageOf } from '../../../shared/errors.ts'
import type { Issue } from '../../../shared/response.ts'
import { type Schema, SchemaFields } from '../../../shared/schema-fields/SchemaFields.tsx'
import { useModelsChanged, usePluginsChanged } from '../hooks/changes.ts'
import {
  type AdminModel,
  type Capabilities,
  capabilityNames,
  noCapabilities,
  storedModel,
} from '../lib/models.ts'
import { adminModelsQuery, adminPluginsQuery } from '../queries.ts'

type Provider = { id: string; name: string; hasAdminKey: boolean; listsModels: boolean }
type Instance = {
  id: string
  package: string
  name: string | null
  enabled: boolean
  options: Record<string, unknown>
  secretFields: string[]
  secretsSet: string[]
  schema: Record<string, unknown> | null
  providers: Provider[]
  status: string
  error: string | null
  issues: Issue[]
}
type Change = { options: Record<string, unknown>; enabled: boolean; clearSecrets: string[] }

interface PluginAdminProps {
  id: string
}

/** One plugin on its own page: its options, its provider models, and its removal. */
export function PluginAdmin(props: PluginAdminProps) {
  const plugins = useQuery(adminPluginsQuery)
  const models = useQuery(adminModelsQuery)
  const navigate = useNavigate()
  const pluginsChanged = usePluginsChanged()
  const save = useMutation({
    mutationFn: (change: Change) =>
      read(api.admin.plugins[':id'].$put({ param: { id: props.id } }, json(change))),
    onSuccess: pluginsChanged,
  })
  const remove = useMutation({
    mutationFn: () => read(api.admin.plugins[':id'].$delete({ param: { id: props.id } })),
    onSuccess: async () => {
      await navigate({ to: '/admin/plugins' })
      await pluginsChanged()
    },
  })
  const instance = plugins.data?.find((candidate) => candidate.id === props.id)
  const loadError = plugins.error ?? models.error
  const error = lastError(save, remove) ?? (loadError && messageOf(loadError))
  return (
    <>
      <Link to="/admin/plugins">Back to plugins</Link>
      {instance ? (
        <section>
          <h2>{instance.name ?? instance.package}</h2>
          <p>
            <code>{instance.package}</code>: {instance.status}
          </p>
          {instance.error && <p role="alert">{instance.error}</p>}
          <PluginForm
            // Start over from the stored options whenever they load or change.
            key={plugins.dataUpdatedAt}
            instance={instance}
            models={(models.data ?? []).map(storedModel)}
            issues={save.error ? issuesOf(save.error) : instance.issues}
            saved={save.isSuccess}
            onSave={save.mutate}
            onRemove={() => remove.mutate()}
          />
        </section>
      ) : (
        plugins.data && <p role="alert">This plugin isn't configured.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

interface PluginFormProps {
  instance: Instance
  models: AdminModel[]
  issues: Issue[]
  saved: boolean
  onSave: (change: Change) => void
  onRemove: () => void
}

function PluginForm(props: PluginFormProps) {
  const form = useForm({
    defaultValues: {
      options: props.instance.options,
      enabled: props.instance.enabled,
      clearSecrets: [],
    } as Change,
    // Options the plugin no longer has are dropped, so a save after an upgrade clears them.
    onSubmit: ({ value }) => props.onSave({ ...value, options: known(value.options) }),
  })
  const known = (values: Record<string, unknown>) => {
    const fields = (props.instance.schema?.properties ?? values) as Record<string, unknown>
    return Object.fromEntries(Object.entries(values).filter(([key]) => key in fields))
  }
  // The provider blocks list models with the options as they are in the form, saved or not.
  const options = useFormStore(form.store, (state) => state.values.options)
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="enabled">
          {(field) => (
            <label>
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />{' '}
              Enabled
            </label>
          )}
        </form.Field>
        {props.instance.schema && (
          <form.Field name="clearSecrets">
            {(cleared) => (
              <form.Field name="options">
                {(field) => (
                  <SchemaFields
                    schema={props.instance.schema as Schema}
                    values={field.state.value}
                    secrets={{
                      fields: props.instance.secretFields,
                      stored: props.instance.secretsSet,
                      clearing: {
                        cleared: cleared.state.value,
                        onClear: (key, clear) =>
                          cleared.handleChange((current) =>
                            clear ? [...current, key] : current.filter((name) => name !== key),
                          ),
                      },
                    }}
                    issues={props.issues}
                    onChange={(key, value) =>
                      field.handleChange((current) => ({ ...current, [key]: value }))
                    }
                  />
                )}
              </form.Field>
            )}
          </form.Field>
        )}
        <button type="submit">Save</button>{' '}
        <button type="button" onClick={props.onRemove}>
          Remove plugin
        </button>
        {props.saved && <span>Saved.</span>}
      </form>
      {props.instance.providers.map((provider) => (
        <ProviderModels
          key={provider.id}
          instance={props.instance}
          options={options}
          provider={provider}
          models={props.models.filter((model) => model.provider === provider.id)}
        />
      ))}
    </>
  )
}

interface ProviderModelsProps {
  instance: Instance
  options: Record<string, unknown>
  provider: Provider
  models: AdminModel[]
}

/** A summary of a provider's admin models, each linking to its page, and the ways to add more. */
function ProviderModels(props: ProviderModelsProps) {
  const [typed, setTyped] = useState('')
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
  const offer = (id: string, name: string, capabilities: Capabilities) =>
    add.mutate({
      provider: props.provider.id,
      id,
      name,
      capabilities,
      roles: ['user'],
      default: false,
    })
  const offered = new Set(props.models.map((model) => model.id))
  const error = lastError(add, list)
  return (
    <div>
      <h3>Models for {props.provider.name}</h3>
      {!props.provider.hasAdminKey && <p>Add an admin key to offer this provider's models.</p>}
      {props.models.length > 0 && (
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
                    params={{ id: props.instance.id }}
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
      )}
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
                  onChange={() => offer(model.id, model.name, model.capabilities)}
                />{' '}
                {model.name} ({model.id})
              </label>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          offer(typed.trim(), typed.trim(), noCapabilities)
          setTyped('')
        }}
      >
        <input
          aria-label={`Model ID for ${props.provider.name}`}
          placeholder="Model ID"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required
        />
        <button type="submit" disabled={!props.provider.hasAdminKey}>
          Add model
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
