import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { ArrowLeftIcon } from '../../../shared/icons.tsx'
import {
  backLink,
  Callout,
  SaveBar,
  SettingRow,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { capabilities } from '../../models/capabilities.ts'
import { useKeysChanged } from '../hooks/useKeysChanged.ts'
import { type Credential, keyLabel } from '../lib/api-keys.ts'
import { credentialsQuery, providersQuery } from '../queries.ts'

type KeyModel = Credential['models'][number]

interface ApiKeyModelSettingsProps {
  id: string
}

/** One of the user's keys on its own page, saying what each of its models can do. */
export function ApiKeyModelSettings(props: ApiKeyModelSettingsProps) {
  const { data: credentials } = useSuspenseQuery(credentialsQuery)
  const { data: providers } = useSuspenseQuery(providersQuery)
  const keysChanged = useKeysChanged()
  const save = useMutation({
    mutationFn: (models: KeyModel[]) =>
      read(api.providers.credentials[':id'].$patch({ param: { id: props.id } }, json({ models }))),
    onSuccess: keysChanged,
  })
  const credential = credentials.find((candidate) => candidate.id === props.id)
  const back = (
    <Link to="/settings/api-keys" className={backLink}>
      <ArrowLeftIcon /> API keys
    </Link>
  )
  if (!credential)
    return (
      <SettingsPage title="API key" back={back}>
        <p role="alert">This key isn't saved anymore.</p>
      </SettingsPage>
    )
  const provider =
    providers.find((p) => p.id === credential.providerId)?.name ?? credential.providerId
  return (
    <SettingsPage
      title={keyLabel(credential, provider)}
      description={credential.baseUrl ? `${provider} · ${credential.baseUrl}` : provider}
      back={back}
    >
      {credential.keyUnreadable && (
        <Callout tone="danger">
          <p role="alert">This key can't be read anymore. Delete it and add it again.</p>
        </Callout>
      )}
      <ModelsForm
        // Start over from the stored models whenever they change.
        key={formKey(credential.models)}
        models={credential.models}
        pending={save.isPending}
        saved={save.isSuccess}
        error={save.error && messageOf(save.error)}
        onSave={save.mutate}
        onEdit={save.reset}
      />
    </SettingsPage>
  )
}

interface ModelsFormProps {
  models: KeyModel[]
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (models: KeyModel[]) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
}

/** A card for each of the key's models, with a switch for each thing it can do. */
function ModelsForm(props: ModelsFormProps) {
  const form = useAppForm({
    defaultValues: { models: props.models },
    listeners: { onChange: () => props.onEdit() },
    onSubmit: ({ value }) => props.onSave(value.models),
  })
  return (
    <form.AppForm>
      <form.Form>
        {props.models.map((model, index) => (
          <SettingsGroup
            key={model.id}
            title={model.name}
            description={model.name === model.id ? undefined : <code>{model.id}</code>}
          >
            {capabilities.map((capability) => (
              <form.AppField
                key={capability.key}
                name={`models[${index}].capabilities.${capability.key}`}
              >
                {(field) => (
                  <SettingRow
                    label={capability.label}
                    htmlFor={`model-${index}-${capability.key}`}
                    description={capability.description}
                  >
                    <field.SwitchField id={`model-${index}-${capability.key}`} />
                  </SettingRow>
                )}
              </form.AppField>
            ))}
          </SettingsGroup>
        ))}
        <SaveBar pending={props.pending} saved={props.saved} error={props.error} />
      </form.Form>
    </form.AppForm>
  )
}
