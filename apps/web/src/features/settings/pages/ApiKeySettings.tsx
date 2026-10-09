import { useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { ErrorAlert } from '../../../shared/ErrorAlert.tsx'
import { lastError } from '../../../shared/errors.ts'
import { useAppForm } from '../../../shared/form.tsx'
import { modelsQuery } from '../../models/queries.ts'
import { credentialsQuery, providersQuery } from '../queries.ts'

interface KeyDraft {
  providerId: string
  apiKey: string
  name: string
  slug: string
  baseUrl: string
  models: string
}

const emptyDraft: KeyDraft = {
  providerId: '',
  apiKey: '',
  name: '',
  slug: '',
  baseUrl: '',
  models: '',
}

/** What a model typed by its ID can do, since nothing says. */
const noCapabilities = { vision: false, reasoning: false, tools: false }

/** The user's own API keys, and a form to add one. */
export function ApiKeySettings() {
  return (
    <section>
      <h2>API keys</h2>
      <ApiKeyList />
      <AddApiKeyForm />
    </section>
  )
}

/** Refresh the keys, and the models, since keys decide which of the user's own models are offered. */
function useKeysChanged() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: credentialsQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: modelsQuery.queryKey }),
    ])
}

function ApiKeyList() {
  const { data: credentials } = useSuspenseQuery(credentialsQuery)
  const keysChanged = useKeysChanged()
  const remove = useMutation({
    mutationFn: (id: string) => read(api.providers.credentials[':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  return (
    <>
      <ul>
        {credentials.map((c) => (
          <li key={c.id}>
            {c.name ?? c.slug ?? c.providerId} ending {c.keyHint}{' '}
            <button type="button" onClick={() => remove.mutate(c.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <ErrorAlert error={remove.error} />
    </>
  )
}

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
      const typed = draft.models
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
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
            models: [...listed, ...typed],
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
  const clearsListed = { onChange: () => listModels.reset() }
  const providerId = useFormStore(form.store, (state) => state.values.providerId)
  const provider = providers.find((p) => p.id === providerId)

  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="providerId" listeners={clearsListed}>
          {(field) => (
            <field.SelectField aria-label="Provider" required>
              <option value="">Choose a provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </field.SelectField>
          )}
        </form.AppField>
        <form.AppField name="apiKey" listeners={clearsListed}>
          {(field) => (
            <field.TextField aria-label="API key" type="password" placeholder="API key" required />
          )}
        </form.AppField>
        <form.AppField name="name">
          {(field) => <field.TextField aria-label="Name" placeholder="Name (optional)" />}
        </form.AppField>
        {provider?.userEndpoints && (
          <>
            <form.AppField name="baseUrl" listeners={clearsListed}>
              {(field) => <field.TextField aria-label="Base URL" placeholder="https://host/v1" />}
            </form.AppField>
            <form.AppField name="slug">
              {(field) => <field.TextField aria-label="Slug" placeholder="my-endpoint" />}
            </form.AppField>
          </>
        )}
        {provider?.listsModels && (
          <button type="button" onClick={() => listModels.mutate(form.state.values)}>
            Load models
          </button>
        )}
        {listed.length > 0 && <span>{listed.length} models loaded</span>}
        <form.AppField name="models">
          {(field) => (
            <field.TextField aria-label="Model IDs" placeholder="Model IDs, separated by commas" />
          )}
        </form.AppField>
        <form.SubmitButton>Add key</form.SubmitButton>
      </form.Form>
      <ErrorAlert error={lastError(add, listModels)} />
    </form.AppForm>
  )
}
