import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { RolePicker } from '../components/RolePicker.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { type AdminModel, capabilityNames, storedModel } from '../lib/models.ts'
import { rolesWithUser } from '../lib/roles.ts'
import { type AdminModelEntry, adminModelsQuery, adminRolesQuery } from '../queries.ts'

interface ModelAdminProps {
  pluginId: string
  provider: string
  modelId: string
}

/** One of a plugin's admin models on its own page. */
export function ModelAdmin(props: ModelAdminProps) {
  const { data: models } = useSuspenseQuery(adminModelsQuery)
  const { data: roles } = useSuspenseQuery(adminRolesQuery)
  const navigate = useNavigate()
  const modelsChanged = useModelsChanged()
  const save = useMutation({
    mutationFn: (model: AdminModel) => read(api.admin.models.$put({}, json(model))),
    onSuccess: modelsChanged,
  })
  const remove = useMutation({
    mutationFn: () =>
      read(api.admin.models.$delete({}, json({ provider: props.provider, id: props.modelId }))),
    // Leave first, so the page doesn't say the model it just removed isn't offered.
    onSuccess: async () => {
      await navigate({ to: '/admin/plugins/$id', params: { id: props.pluginId } })
      await modelsChanged()
    },
  })
  return (
    <>
      <Link to="/admin/plugins/$id" params={{ id: props.pluginId }}>
        Back to plugin
      </Link>
      <ModelDetails
        model={models.find(
          (candidate) => candidate.provider === props.provider && candidate.id === props.modelId,
        )}
        roleNames={rolesWithUser(roles.roles)}
        saved={save.isSuccess}
        onSave={save.mutate}
        onRemove={() => remove.mutate()}
      />
      <ErrorAlert error={lastError(save, remove)} />
    </>
  )
}

interface ModelDetailsProps {
  model: AdminModelEntry | undefined
  roleNames: string[]
  saved: boolean
  onSave: (model: AdminModel) => void
  onRemove: () => void
}

/** The model's form, or that it isn't offered. */
function ModelDetails(props: ModelDetailsProps) {
  if (!props.model) return <p role="alert">This model isn't offered.</p>
  return (
    <section>
      <h2>{props.model.name}</h2>
      <p>
        <code>
          {props.model.provider}/{props.model.id}
        </code>
      </p>
      {props.model.warning && <p role="alert">{props.model.warning}</p>}
      <ModelForm
        // Start over from the stored model whenever it changes.
        key={formKey(props.model)}
        model={storedModel(props.model)}
        roleNames={props.roleNames}
        saved={props.saved}
        onSave={props.onSave}
        onRemove={props.onRemove}
      />
    </section>
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
  const form = useAppForm({
    defaultValues: props.model,
    onSubmit: ({ value }) => props.onSave(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <fieldset>
          <legend>Capabilities</legend>
          {capabilityNames.map((capability) => (
            <form.AppField key={capability} name={`capabilities.${capability}`}>
              {(field) => <field.CheckboxField label={capability} />}
            </form.AppField>
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
        <form.SubmitButton>Save</form.SubmitButton>{' '}
        <button type="button" onClick={props.onRemove}>
          Remove model
        </button>
        {props.saved && <span>Saved.</span>}
      </form.Form>
    </form.AppForm>
  )
}
