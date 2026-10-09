import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { formKey } from '../../../shared/form.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { type AdminModel, capabilityNames, storedModel } from '../lib/models.ts'
import { rolesWithUser } from '../lib/roles.ts'
import { adminModelsQuery, adminRolesQuery } from '../queries.ts'

interface ModelAdminProps {
  pluginId: string
  provider: string
  modelId: string
}

/** One of a plugin's admin models on its own page. */
export function ModelAdmin(props: ModelAdminProps) {
  const models = useQuery(adminModelsQuery)
  const roles = useQuery(adminRolesQuery)
  const navigate = useNavigate()
  const modelsChanged = useModelsChanged()
  const save = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$put({}, json(model))),
    onSuccess: modelsChanged,
  })
  const remove = useMutation({
    mutationFn: () =>
      read(api.admin.models.$delete({}, json({ provider: props.provider, id: props.modelId }))),
    onSuccess: async () => {
      await navigate({ to: '/admin/plugins/$id', params: { id: props.pluginId } })
      await modelsChanged()
    },
  })
  const found = models.data?.find(
    (candidate) => candidate.provider === props.provider && candidate.id === props.modelId,
  )
  const loadError = models.error ?? roles.error
  const error = lastError(save, remove) ?? (loadError && messageOf(loadError))
  return (
    <>
      <Link to="/admin/plugins/$id" params={{ id: props.pluginId }}>
        Back to plugin
      </Link>
      {found && (
        <section>
          <h2>{found.name}</h2>
          <p>
            <code>
              {found.provider}/{found.id}
            </code>
          </p>
          {found.warning && <p role="alert">{found.warning}</p>}
          <ModelForm
            // Start over from the stored model whenever it changes.
            key={formKey(found)}
            model={storedModel(found)}
            roleNames={rolesWithUser(roles.data?.roles ?? [])}
            saved={save.isSuccess}
            onSave={save.mutate}
            onRemove={() => remove.mutate()}
          />
        </section>
      )}
      {models.data && !found && <p role="alert">This model isn't offered.</p>}
      {error && <p role="alert">{error}</p>}
    </>
  )
}

interface ModelFormProps {
  model: AdminModel
  roleNames: string[]
  saved: boolean
  onSave: (model: AdminModel) => void
  onRemove: () => void
}

/** One admin model's name, capabilities, and roles. */
function ModelForm(props: ModelFormProps) {
  const form = useForm({ defaultValues: props.model, onSubmit: ({ value }) => props.onSave(value) })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => (
          <label>
            Name{' '}
            <input value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
          </label>
        )}
      </form.Field>
      <fieldset>
        <legend>Capabilities</legend>
        {capabilityNames.map((capability) => (
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
      </fieldset>
      <fieldset>
        <legend>Roles</legend>
        <form.Field name="roles">
          {(field) => (
            <RolePicker
              names={props.roleNames}
              picked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      </fieldset>
      <button type="submit">Save</button>{' '}
      <button type="button" onClick={props.onRemove}>
        Remove model
      </button>
      {props.saved && <span>Saved.</span>}
    </form>
  )
}
