import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { api, json, read } from '../../../shared/api.ts'
import { cn } from '../../../shared/cn.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { messageOf } from '../../../shared/errors.ts'
import { formKey, useAppForm } from '../../../shared/form.tsx'
import { ArrowLeftIcon, CloseIcon } from '../../../shared/icons.tsx'
import { Button, IconButton } from '../../../shared/ui/Button.tsx'
import { Checklist, ChecklistItem } from '../../../shared/ui/Checklist.tsx'
import { field } from '../../../shared/ui/controls.tsx'
import { Item, ItemList, ItemNames } from '../../../shared/ui/ItemList.tsx'
import {
  backLink,
  Callout,
  cardAlert,
  inlineForm,
  SaveBar,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
  undivided,
} from '../../../shared/ui/SettingsPage.tsx'
import { ToggleChip } from '../../../shared/ui/ToggleChip.tsx'
import { capabilities, noCapabilities } from '../../models/capabilities.ts'
import { ModelName } from '../../models/components/ModelName.tsx'
import { useKeysChanged } from '../hooks/changes.ts'
import { type Credential, keyDescription, keyLabel } from '../lib/api-keys.ts'
import { credentialsQuery, providersQuery } from '../queries.ts'

type KeyModel = Credential['models'][number]

interface ApiKeyModelSettingsProps {
  id: string
}

/** One of the user's keys on its own page: its models, what each can do, and adding more. */
export function ApiKeyModelSettings(props: ApiKeyModelSettingsProps) {
  const { data: credentials } = useSuspenseQuery(credentialsQuery)
  const { data: providers } = useSuspenseQuery(providersQuery)
  const keysChanged = useKeysChanged()
  const save = useMutation({
    mutationFn: (models: KeyModel[]) =>
      read(api.providers.credentials[':id'].$patch({ param: { id: props.id } }, json({ models }))),
    onSuccess: keysChanged,
  })
  // Listed here rather than in the form, so a save, which starts the form over, keeps the list.
  const list = useMutation({
    mutationFn: () =>
      read(api.providers.credentials[':id']['list-models'].$post({ param: { id: props.id } })),
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
  const provider = providers.find((p) => p.id === credential.providerId)
  const providerName = provider?.name ?? credential.providerId
  return (
    <SettingsPage
      title={keyLabel(credential, providerName)}
      description={keyDescription(credential, providerName)}
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
        listing={{
          available: Boolean(provider?.listsModels),
          models: list.data?.models ?? [],
          pending: list.isPending,
          error: list.error,
          onLoad: () => list.mutate(),
        }}
        pending={save.isPending}
        saved={save.isSuccess}
        error={save.error && messageOf(save.error)}
        onSave={save.mutate}
        onEdit={save.reset}
      />
    </SettingsPage>
  )
}

/** The models the provider lists for the key, loaded on request. */
interface Listing {
  /** Whether the provider can list its models. */
  available: boolean
  models: KeyModel[]
  pending: boolean
  error: Error | null
  onLoad: () => void
}

interface ModelsFormProps {
  models: KeyModel[]
  listing: Listing
  pending: boolean
  saved: boolean
  error?: string | null
  onSave: (models: KeyModel[]) => void
  /** Called on any change, since what is shown is no longer what was saved. */
  onEdit: () => void
}

/** The key's models as one draft, changed by their chips and by adding or removing models. */
function ModelsForm(props: ModelsFormProps) {
  const form = useAppForm({
    defaultValues: { models: props.models },
    onSubmit: ({ value }) => props.onSave(value.models),
  })
  return (
    <form.AppForm>
      <form.Form>
        <form.Field name="models">
          {(models) => {
            const change = (next: KeyModel[]) => {
              models.handleChange(next)
              props.onEdit()
            }
            return (
              <>
                <SettingsGroup
                  title="Models"
                  description="What each model can do decides what the app offers with it."
                >
                  <ModelRows models={models.state.value} onChange={change} />
                </SettingsGroup>
                <SettingsGroup
                  title="Add models"
                  description={
                    props.listing.available
                      ? 'Load the models your key can use and tick the ones to add, or type a model ID.'
                      : 'Type the ID of a model to add.'
                  }
                >
                  <AddModels
                    models={models.state.value}
                    listing={props.listing}
                    onChange={change}
                  />
                </SettingsGroup>
                <SaveBar
                  pending={props.pending}
                  disabled={models.state.value.length === 0}
                  saved={props.saved}
                  error={props.error}
                />
              </>
            )
          }}
        </form.Field>
      </form.Form>
    </form.AppForm>
  )
}

interface ModelRowsProps {
  models: KeyModel[]
  onChange: (models: KeyModel[]) => void
}

/** A row for each model, with a chip for each thing it can do and a way to remove it. */
function ModelRows(props: ModelRowsProps) {
  if (!props.models.length)
    return <SettingsEmpty>No models. Add one below, since a key needs at least one.</SettingsEmpty>
  const replace = (index: number, model: KeyModel) =>
    props.onChange(props.models.map((each, i) => (i === index ? model : each)))
  return (
    <ItemList>
      {props.models.map((model, index) => (
        <Item key={model.id}>
          {/* In a narrow column the chips always go under the name, so every row reads alike. */}
          <ItemNames
            title={model.name}
            description={model.name === model.id ? undefined : <code>{model.id}</code>}
            className="@max-narrow:basis-full"
          />
          <span className="ms-auto flex @max-narrow:w-full items-center justify-between gap-3">
            <fieldset aria-label={`What ${model.name} can do`} className="flex min-w-0 gap-1.5">
              {capabilities.map((capability) => (
                <ToggleChip
                  key={capability.key}
                  pressed={model.capabilities[capability.key]}
                  onPressedChange={(pressed) =>
                    replace(index, {
                      ...model,
                      capabilities: { ...model.capabilities, [capability.key]: pressed },
                    })
                  }
                >
                  {capability.label}
                </ToggleChip>
              ))}
            </fieldset>
            <IconButton
              aria-label={`Remove ${model.name}`}
              onClick={() => props.onChange(props.models.filter((_, i) => i !== index))}
            >
              <CloseIcon />
            </IconButton>
          </span>
        </Item>
      ))}
    </ItemList>
  )
}

interface AddModelsProps {
  models: KeyModel[]
  listing: Listing
  onChange: (models: KeyModel[]) => void
}

/** The models the provider lists, to tick the ones to use, over a field to type one. */
function AddModels(props: AddModelsProps) {
  const [typed, setTyped] = useState('')
  const using = new Set(props.models.map((model) => model.id))
  const toggle = (model: KeyModel) =>
    props.onChange(
      using.has(model.id)
        ? props.models.filter((each) => each.id !== model.id)
        : [...props.models, model],
    )
  const addTyped = () => {
    const id = typed.trim()
    if (!id) return
    if (!using.has(id))
      props.onChange([...props.models, { id, name: id, capabilities: noCapabilities }])
    setTyped('')
  }
  const listed = props.listing.models
  return (
    <>
      {listed.length > 0 && (
        <Checklist>
          {listed.map((model) => (
            <ChecklistItem
              key={model.id}
              checked={using.has(model.id)}
              onChange={() => toggle(model)}
            >
              <ModelName model={model} />
            </ChecklistItem>
          ))}
        </Checklist>
      )}
      {/* Not a form of its own, since it sits in the key's form: Enter adds rather than saves. */}
      <div className={cn(inlineForm, listed.length > 0 && undivided)}>
        <input
          aria-label="Model ID"
          placeholder="Model ID"
          className={field}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            addTyped()
          }}
        />
        <Button disabled={!typed.trim()} onClick={addTyped}>
          Add model
        </Button>
        {props.listing.available && (
          <Button tone="quiet" busy={props.listing.pending} onClick={props.listing.onLoad}>
            Load models
          </Button>
        )}
      </div>
      <ErrorAlert error={props.listing.error} className={cardAlert} />
    </>
  )
}
