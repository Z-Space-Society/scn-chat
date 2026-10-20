import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { ArrowLeftIcon } from '../../../shared/icons.tsx'
import {
  backLink,
  Callout,
  ConfirmButton,
  type Save,
  SaveBar,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { capabilities } from '../../models/capabilities.ts'
import { RolePicker } from '../components/RolePicker.tsx'
import { useModelsChanged } from '../hooks/changes.ts'
import { type AdminModel, storedModel } from '../lib/models.ts'
import { rolesWithUser } from '../lib/roles.ts'
import { adminModelsQuery, adminRolesQuery } from '../queries.ts'

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
  const model = models.find(
    (candidate) => candidate.provider === props.provider && candidate.id === props.modelId,
  )
  const back = (
    <Link to="/admin/plugins/$id" params={{ id: props.pluginId }} className={backLink}>
      <ArrowLeftIcon /> Plugin
    </Link>
  )
  if (!model)
    return (
      <SettingsPage title="Model" back={back}>
        <p role="alert">This model isn't offered.</p>
      </SettingsPage>
    )
  return (
    <SettingsPage
      title={model.name}
      description={
        <code>
          {model.provider}/{model.id}
        </code>
      }
      back={back}
    >
      {model.warning && (
        <Callout tone="danger">
          <p role="alert">{model.warning}</p>
        </Callout>
      )}
      <ModelForm
        // Start over from the stored model whenever it changes.
        key={formKey(model)}
        model={storedModel(model)}
        roleNames={rolesWithUser(roles.roles)}
        save={save}
      />
      <SettingsGroup danger>
        <SettingRow
          label="Remove this model"
          description="People stop being offered it. Chats that used it keep their replies."
          issues={
            remove.error && (
              <p role="alert" className="mt-0.75 text-danger text-small">
                {messageOf(remove.error)}
              </p>
            )
          }
        >
          <ConfirmButton
            label="Remove model"
            question="Remove this model?"
            onConfirm={() => remove.mutate()}
          />
        </SettingRow>
      </SettingsGroup>
    </SettingsPage>
  )
}

interface ModelFormProps {
  model: AdminModel
  roleNames: string[]
  save: Save<AdminModel>
}

/** One admin model's name, capabilities, and roles. */
function ModelForm(props: ModelFormProps) {
  const form = useAppForm({
    defaultValues: props.model,
    listeners: { onChange: () => props.save.reset() },
    onSubmit: ({ value }) => props.save.mutate(value),
  })
  return (
    <form.AppForm>
      <form.Form>
        <SettingsGroup title="Details">
          <form.AppField name="name">
            {(field) => (
              <SettingRow
                label="Name"
                htmlFor="model-name"
                description="What people see in the model picker."
              >
                <field.TextField id="model-name" />
              </SettingRow>
            )}
          </form.AppField>
        </SettingsGroup>
        <SettingsGroup
          title="Capabilities"
          description="What the model can do, which decides what the app offers with it."
        >
          {capabilities.map((capability) => (
            <form.AppField key={capability.key} name={`capabilities.${capability.key}`}>
              {(field) => (
                <SettingRow
                  label={capability.label}
                  htmlFor={`model-${capability.key}`}
                  description={capability.description}
                >
                  <field.SwitchField id={`model-${capability.key}`} />
                </SettingRow>
              )}
            </form.AppField>
          ))}
        </SettingsGroup>
        <SettingsGroup
          title="Roles"
          description="Only people with one of these roles are offered the model."
        >
          <form.Field name="roles">
            {(field) => (
              <RolePicker
                names={props.roleNames}
                picked={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </SettingsGroup>
        <SaveBar save={props.save} />
      </form.Form>
    </form.AppForm>
  )
}
