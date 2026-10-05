import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { api, json, read } from '../../api.ts'
import { type Schema, SchemaFields } from '../../components/SchemaFields.tsx'
import { issuesOf, lastError, messageOf } from '../../lib/errors.ts'
import type { Issue } from '../../lib/response.ts'
import { adminModelsQuery, adminPluginsQuery, adminRolesQuery } from '../../queries.ts'
import { useModelsChanged, usePluginsChanged } from './changes.ts'
import { RolePicker } from './role-picker.tsx'

type Capabilities = { vision: boolean; reasoning: boolean; tools: boolean }
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
type AdminModel = {
  provider: string
  id: string
  name: string
  capabilities: Capabilities
  roles: string[]
  default: boolean
}
type Change = { options: Record<string, unknown>; enabled: boolean; clearSecrets: string[] }

const noCapabilities: Capabilities = { vision: false, reasoning: false, tools: false }

/** One plugin on its own page: its options, its provider models, and its removal. */
export function PluginAdmin({ id }: { id: string }) {
  const plugins = useQuery(adminPluginsQuery)
  const models = useQuery(adminModelsQuery)
  const roles = useQuery(adminRolesQuery)
  const navigate = useNavigate()
  const pluginsChanged = usePluginsChanged()
  const save = useMutation({
    mutationFn: (change: Change) =>
      read(api.admin.plugins[':id'].$put({ param: { id } }, json(change))),
    onSuccess: pluginsChanged,
  })
  const remove = useMutation({
    mutationFn: () => read(api.admin.plugins[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      await navigate({ to: '/admin/plugins' })
      await pluginsChanged()
    },
  })
  const instance = plugins.data?.find((candidate) => candidate.id === id)
  const loadError = plugins.error ?? models.error ?? roles.error
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
            models={(models.data ?? []).map(({ warning: _warning, ...model }) => model)}
            roleNames={['user', ...(roles.data?.roles ?? []).map((role) => role.name)]}
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

function PluginForm({
  instance,
  models,
  roleNames,
  issues,
  saved,
  onSave,
  onRemove,
}: {
  instance: Instance
  models: AdminModel[]
  roleNames: string[]
  issues: Issue[]
  saved: boolean
  onSave: (change: Change) => void
  onRemove: () => void
}) {
  const form = useForm({
    defaultValues: {
      options: instance.options,
      enabled: instance.enabled,
      clearSecrets: [],
    } as Change,
    onSubmit: ({ value }) => onSave(value),
  })
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
        {instance.schema && (
          <form.Field name="clearSecrets">
            {(cleared) => (
              <form.Field name="options">
                {(field) => (
                  <SchemaFields
                    schema={instance.schema as Schema}
                    values={field.state.value}
                    secretFields={instance.secretFields}
                    secretsSet={instance.secretsSet}
                    cleared={cleared.state.value}
                    onClear={(key, clear) =>
                      cleared.handleChange((current) =>
                        clear ? [...current, key] : current.filter((name) => name !== key),
                      )
                    }
                    issues={issues}
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
        <button type="button" onClick={onRemove}>
          Remove plugin
        </button>
        {saved && <span>Saved.</span>}
      </form>
      {instance.providers.map((provider) => (
        <ProviderModels
          key={provider.id}
          instance={instance}
          options={options}
          provider={provider}
          models={models.filter((model) => model.provider === provider.id)}
          roleNames={roleNames}
        />
      ))}
    </>
  )
}

/** A provider's admin models, with a model list fetched using the plugin form's current options. */
function ProviderModels({
  instance,
  options,
  provider,
  models,
  roleNames,
}: {
  instance: Instance
  options: Record<string, unknown>
  provider: Provider
  models: AdminModel[]
  roleNames: string[]
}) {
  const [listed, setListed] = useState<Omit<AdminModel, 'roles' | 'default'>[]>([])
  const [typed, setTyped] = useState('')
  const modelsChanged = useModelsChanged()
  const add = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$post({}, json(model))),
    onSuccess: modelsChanged,
  })
  const change = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$put({}, json(model))),
    onSuccess: modelsChanged,
  })
  const remove = useMutation({
    mutationFn: ({ provider, id }: AdminModel) =>
      read(api.admin.models.$delete({}, json({ provider, id }))),
    onSuccess: modelsChanged,
  })
  const list = useMutation({
    mutationFn: () =>
      read(
        api.admin.plugins['list-models'].$post(
          {},
          json({ package: instance.package, instanceId: instance.id, options }),
        ),
      ),
    onSuccess: (body) => setListed(body.models.filter((m) => m.provider === provider.id)),
  })
  // A model a provider lists starts with the user role and the capabilities the list reports.
  const offer = (id: string, name: string, capabilities: Capabilities) =>
    add.mutate({ provider: provider.id, id, name, capabilities, roles: ['user'], default: false })
  const offered = new Set(models.map((model) => model.id))
  const error = lastError(add, change, remove, list)
  return (
    <div>
      <h4>Models for {provider.name}</h4>
      {!provider.hasAdminKey && <p>Add an admin key to offer this provider's models.</p>}
      <ul>
        {models.map((model) => (
          <li key={model.id}>
            <ModelEditor
              // Start over from the stored model whenever it changes.
              key={JSON.stringify(model)}
              model={model}
              roleNames={roleNames}
              onSave={change.mutate}
              onRemove={() => remove.mutate(model)}
            />
          </li>
        ))}
      </ul>
      {provider.listsModels && (
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
                  disabled={offered.has(model.id) || !provider.hasAdminKey}
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
          aria-label={`Model ID for ${provider.name}`}
          placeholder="Model ID"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required
        />
        <button type="submit" disabled={!provider.hasAdminKey}>
          Add model
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

/** One admin model's name, capabilities, and roles. */
function ModelEditor({
  model,
  roleNames,
  onSave,
  onRemove,
}: {
  model: AdminModel
  roleNames: string[]
  onSave: (model: AdminModel) => void
  onRemove: () => void
}) {
  const form = useForm({ defaultValues: model, onSubmit: ({ value }) => onSave(value) })
  return (
    <fieldset>
      <legend>{model.id}</legend>
      <form.Field name="name">
        {(field) => (
          <label>
            Name{' '}
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </label>
        )}
      </form.Field>
      {(['vision', 'reasoning', 'tools'] as const).map((capability) => (
        <form.Field key={capability} name={`capabilities.${capability}`}>
          {(field) => (
            <label>
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />{' '}
              {capability}
            </label>
          )}
        </form.Field>
      ))}
      <div>
        Roles:{' '}
        <form.Field name="roles">
          {(field) => (
            <RolePicker
              names={roleNames}
              picked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      </div>
      <button type="button" onClick={() => void form.handleSubmit()}>
        Save model
      </button>{' '}
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </fieldset>
  )
}
