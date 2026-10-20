import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { KeyIcon, TrashIcon } from '../../../shared/icons.tsx'
import { plural } from '../../../shared/plural.ts'
import { Button } from '../../../shared/ui/Button.tsx'
import { Checklist, ChecklistItem } from '../../../shared/ui/Checklist.tsx'
import { literalInput, secretInput } from '../../../shared/ui/controls.tsx'
import * as ItemList from '../../../shared/ui/ItemList.tsx'
import {
  ConfirmButton,
  Field,
  fields,
  SettingsEmpty,
  SettingsGroup,
  SettingsPage,
} from '../../../shared/ui/SettingsPage.tsx'
import { noCapabilities } from '../../models/capabilities.ts'
import { ModelName } from '../../models/components/ModelName.tsx'
import { useKeysChanged } from '../hooks/changes.ts'
import { type Credential, keyDescription, keyLabel } from '../lib/api-keys.ts'
import { credentialsQuery, providersQuery } from '../queries.ts'

interface KeyDraft {
  providerId: string
  apiKey: string
  name: string
  slug: string
  baseUrl: string
  models: string
  /** The IDs of the loaded models ticked to add. */
  picked: string[]
}

const emptyDraft: KeyDraft = {
  providerId: '',
  apiKey: '',
  name: '',
  slug: '',
  baseUrl: '',
  models: '',
  picked: [],
}

/** The user's own API keys, and a form to add one. */
export function ApiKeySettings() {
  return (
    <SettingsPage
      title="API keys"
      description="Use models from your own provider accounts. Keys are stored encrypted on this server, never in your chats."
    >
      <SettingsGroup title="Your keys">
        <ApiKeyList />
      </SettingsGroup>
      <SettingsGroup title="Add a key">
        <AddApiKeyForm />
      </SettingsGroup>
    </SettingsPage>
  )
}

/** The user's keys, each opening its page, named and ending in its last four characters, with a way to delete it. */
function ApiKeyList() {
  const { data: credentials } = useSuspenseQuery(credentialsQuery)
  const { data: providers } = useSuspenseQuery(providersQuery)
  const keysChanged = useKeysChanged()
  const remove = useMutation({
    mutationFn: (id: string) => read(api.providers.credentials[':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id
  if (!credentials.length)
    return (
      <SettingsEmpty>
        No keys yet. Add one below to chat with models from your own accounts.
      </SettingsEmpty>
    )
  return (
    <>
      <ItemList.Root>
        {credentials.map((credential) => (
          <ApiKeyRow
            key={credential.id}
            credential={credential}
            provider={providerName(credential.providerId)}
            deleting={remove.isPending && remove.variables === credential.id}
            onDelete={() => remove.mutate(credential.id)}
          />
        ))}
      </ItemList.Root>
      <ErrorAlert error={remove.error} className="px-card-pad pb-card-pad text-small" />
    </>
  )
}

interface ApiKeyRowProps {
  credential: Credential
  /** The key's provider, by name. */
  provider: string
  deleting: boolean
  onDelete: () => void
}

/** One key, which opens its models' page and asks in place before it is deleted. */
function ApiKeyRow(props: ApiKeyRowProps) {
  const credential = props.credential
  const label = keyLabel(credential, props.provider)
  return (
    <ItemList.LinkItem deleting={props.deleting}>
      <ItemList.Mark>
        <KeyIcon />
      </ItemList.Mark>
      <ItemList.Names
        title={
          <Link to="/settings/api-keys/$id" params={{ id: credential.id }}>
            {label}
          </Link>
        }
        description={keyDescription(credential, props.provider)}
        details={[plural(credential.models.length, { one: '# model', other: '# models' })]}
      />
      <KeyHint credential={credential} />
      <ConfirmButton
        label="Delete key"
        question="Delete this key?"
        icon={{ icon: <TrashIcon />, label: `Delete ${label}` }}
        onConfirm={props.onDelete}
      />
    </ItemList.LinkItem>
  )
}

interface KeyHintProps {
  credential: Credential
}

/** The key's last four characters, or that it can't be read and must be added again. */
function KeyHint(props: KeyHintProps) {
  if (props.credential.keyUnreadable)
    return (
      <span className="text-danger text-small">
        {props.credential.baseUrl
          ? "Can't be read. Delete it and add it again."
          : "Can't be read. Add it again."}
      </span>
    )
  return (
    <code
      title="The key's last four characters"
      className="rounded-badge bg-surface px-1.75 py-0.5 text-caption text-muted tracking-key"
    >
      <span aria-hidden="true">••••</span>
      <span className="sr-only">ending </span>
      {props.credential.keyHint}
    </code>
  )
}

/** A form whose labels sit over their fields, two to a row where there is room. */
function AddApiKeyForm() {
  const { data: providers } = useSuspenseQuery(providersQuery)
  const keysChanged = useKeysChanged()
  const listModels = useMutation({
    mutationFn: (draft: Pick<KeyDraft, 'providerId' | 'apiKey' | 'baseUrl'>) =>
      read(
        api.providers.providers[':id']['list-models'].$post(
          { param: { id: draft.providerId } },
          json({ apiKey: draft.apiKey, baseUrl: draft.baseUrl || undefined }),
        ),
      ),
  })
  // Models listed by the provider for the key being added, until what they were listed with changes.
  const listed = listModels.data?.models ?? []
  const add = useMutation({
    mutationFn: (draft: KeyDraft) => {
      // The select can't be required as a native one can, so the form says it here.
      if (!draft.providerId) throw new Error('Choose a provider.')
      const picked = listed.filter((model) => draft.picked.includes(model.id))
      const typed = draft.models
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id && !draft.picked.includes(id))
        .map((id) => ({ id, name: id, capabilities: noCapabilities }))
      return read(
        api.providers.credentials.$post(
          {},
          json({
            providerId: draft.providerId,
            apiKey: draft.apiKey,
            name: draft.name || undefined,
            slug: draft.slug || undefined,
            baseUrl: draft.baseUrl || undefined,
            models: [...picked, ...typed],
          }),
        ),
      )
    },
    onSuccess: () => {
      listModels.reset()
      return keysChanged()
    },
  })
  const form = useAppForm({
    defaultValues: emptyDraft,
    onSubmit: ({ value, formApi }) => add.mutate(value, { onSuccess: () => formApi.reset() }),
  })
  // What was listed, and what was ticked of it, belong to the provider and key it was listed with.
  const clearsListed = {
    onChange: () => {
      listModels.reset()
      form.setFieldValue('picked', [])
    },
  }
  const providerId = useFormStore(form.store, (state) => state.values.providerId)
  const apiKey = useFormStore(form.store, (state) => state.values.apiKey)
  const picked = useFormStore(form.store, (state) => state.values.picked)
  const provider = providers.find((p) => p.id === providerId)

  return (
    <form.AppForm>
      <form.Form className="p-card-pad">
        <div className={fields}>
          <form.AppField name="providerId" listeners={clearsListed}>
            {(field) => (
              <Field label="Provider" htmlFor="key-provider">
                <field.SelectField
                  id="key-provider"
                  placeholder="Choose a provider"
                  options={providers.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="apiKey" listeners={clearsListed}>
            {(field) => (
              <Field label="API key" htmlFor="key-secret">
                <field.TextField id="key-secret" type="password" {...secretInput} required />
              </Field>
            )}
          </form.AppField>
          <form.AppField name="name">
            {(field) => (
              <Field
                label="Name"
                htmlFor="key-name"
                optional
                wide
                hint="Helps you tell your keys apart, such as Work or Personal."
              >
                <field.TextField id="key-name" />
              </Field>
            )}
          </form.AppField>
          {provider?.userEndpoints && (
            <>
              <form.AppField name="baseUrl" listeners={clearsListed}>
                {(field) => (
                  <Field label="Base URL" htmlFor="key-base-url">
                    <field.TextField
                      id="key-base-url"
                      type="url"
                      placeholder="https://host/v1"
                      {...literalInput}
                    />
                  </Field>
                )}
              </form.AppField>
              <form.AppField name="slug">
                {(field) => (
                  <Field
                    label="Slug"
                    htmlFor="key-slug"
                    hint="Lowercase letters, numbers, and dashes. Your chats name this endpoint's models by it."
                  >
                    <field.TextField id="key-slug" placeholder="my-endpoint" {...literalInput} />
                  </Field>
                )}
              </form.AppField>
            </>
          )}
          <form.AppField name="models">
            {(field) => (
              <Field
                label="Model IDs"
                htmlFor="key-models"
                optional={picked.length > 0}
                wide
                hint={
                  provider?.listsModels
                    ? 'Load the models your key can use and tick the ones to add, or type IDs, separated by commas.'
                    : 'The models to use with this key, separated by commas.'
                }
              >
                <div className="flex gap-2">
                  <field.TextField
                    id="key-models"
                    placeholder="model-id, another-model"
                    {...literalInput}
                    className="h-9.25 min-w-0 flex-1"
                  />
                  {provider?.listsModels && (
                    <Button
                      busy={listModels.isPending}
                      disabled={!apiKey}
                      onClick={() => listModels.mutate(form.state.values)}
                      className="flex-none"
                    >
                      Load models
                    </Button>
                  )}
                </div>
              </Field>
            )}
          </form.AppField>
          {listed.length > 0 && (
            <form.Field name="picked">
              {(field) => (
                <fieldset className="col-span-full min-w-0">
                  <legend className="mb-1.5 font-medium text-ink-strong text-ui">
                    Loaded models
                  </legend>
                  <div className="rounded-small border border-line bg-raised pb-card-pad">
                    <Checklist>
                      {listed.map((model) => (
                        <ChecklistItem
                          key={model.id}
                          checked={field.state.value.includes(model.id)}
                          onChange={() =>
                            field.handleChange((ids) =>
                              ids.includes(model.id)
                                ? ids.filter((id) => id !== model.id)
                                : [...ids, model.id],
                            )
                          }
                        >
                          <ModelName model={model} />
                        </ChecklistItem>
                      ))}
                    </Checklist>
                  </div>
                </fieldset>
              )}
            </form.Field>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-3 border-line border-t pt-4">
          <span role="status" className="me-auto text-accent-strong text-small">
            {listed.length > 0 &&
              `${plural(listed.length, { one: '# model', other: '# models' })} loaded`}
          </span>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <Button type="submit" busy={submitting || add.isPending}>
                Add key
              </Button>
            )}
          </form.Subscribe>
        </div>
        <ErrorAlert error={lastError(add, listModels)} className="mt-3 text-small" />
      </form.Form>
    </form.AppForm>
  )
}
