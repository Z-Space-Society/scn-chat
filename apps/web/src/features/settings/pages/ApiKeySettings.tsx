import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json, read } from '../../../shared/api.ts'
import { lastError, messageOf } from '../../../shared/errors.ts'
import { modelsQuery } from '../../models/queries.ts'
import { credentialsQuery, providersQuery } from '../queries.ts'

type KeyDraft = {
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

export function ApiKeySettings() {
  const providers = useQuery(providersQuery)
  const credentials = useQuery(credentialsQuery)
  const queryClient = useQueryClient()
  // Keys decide which of the user's own models are offered.
  const keysChanged = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: credentialsQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: modelsQuery.queryKey }),
    ])
  const none = { vision: false, reasoning: false, tools: false }

  const add = useMutation({
    mutationFn: (draft: KeyDraft) => {
      const typed = draft.models
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => ({ id, name: id, capabilities: none }))
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
      form.reset()
      listModels.reset()
      return keysChanged()
    },
  })
  const form = useForm({
    defaultValues: emptyDraft,
    onSubmit: ({ value }) => add.mutate(value),
  })
  const remove = useMutation({
    mutationFn: (id: string) => read(api.providers.credentials[':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  const listModels = useMutation({
    mutationFn: () => {
      const { providerId, apiKey, baseUrl } = form.state.values
      return read(
        api.providers.providers[':id']['list-models'].$post(
          { param: { id: providerId } },
          json({ apiKey, baseUrl: baseUrl || undefined }),
        ),
      )
    },
  })
  // Models listed by the provider for the key being added, until what they were listed with changes.
  const listed = listModels.data?.models ?? []
  const clearsListed = { onChange: () => listModels.reset() }
  const providerId = useFormStore(form.store, (state) => state.values.providerId)
  const provider = providers.data?.find((p) => p.id === providerId)
  const loadError = providers.error ?? credentials.error
  const error = lastError(add, remove, listModels) ?? (loadError && messageOf(loadError))

  return (
    <section>
      <h2>API keys</h2>
      <ul>
        {(credentials.data ?? []).map((c) => (
          <li key={c.id}>
            {c.name ?? c.slug ?? c.providerId} ending {c.keyHint}{' '}
            <button type="button" onClick={() => remove.mutate(c.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="providerId" listeners={clearsListed}>
          {(field) => (
            <select
              aria-label="Provider"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            >
              <option value="">Choose a provider</option>
              {(providers.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </form.Field>
        <form.Field name="apiKey" listeners={clearsListed}>
          {(field) => (
            <input
              aria-label="API key"
              type="password"
              placeholder="API key"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              required
            />
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <input
              aria-label="Name"
              placeholder="Name (optional)"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
        {provider?.userEndpoints && (
          <>
            <form.Field name="baseUrl" listeners={clearsListed}>
              {(field) => (
                <input
                  aria-label="Base URL"
                  placeholder="https://host/v1"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
            <form.Field name="slug">
              {(field) => (
                <input
                  aria-label="Slug"
                  placeholder="my-endpoint"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </form.Field>
          </>
        )}
        {provider?.listsModels && (
          <button type="button" onClick={() => listModels.mutate()}>
            Load models
          </button>
        )}
        {listed.length > 0 && <span>{listed.length} models loaded</span>}
        <form.Field name="models">
          {(field) => (
            <input
              aria-label="Model IDs"
              placeholder="Model IDs, separated by commas"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        </form.Field>
        <button type="submit">Add key</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
