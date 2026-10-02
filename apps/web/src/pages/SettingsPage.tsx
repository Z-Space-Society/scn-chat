import { useForm, useStore as useFormStore } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { api, json, read } from '../api.ts'
import { type ModelOption, modelKey } from '../components/Composer.tsx'
import { SchemaFields } from '../components/SchemaFields.tsx'
import { useSignOut } from '../components/useSignOut.ts'
import { lastError, messageOf } from '../lib/errors.ts'
import { browserTimeZone } from '../lib/time-zone.ts'
import {
  accountQuery,
  credentialsQuery,
  modelsQuery,
  pluginSettingsQuery,
  preferencesQuery,
  providersQuery,
} from '../queries.ts'
import { useStore } from '../store/react.tsx'
import { useModels } from './ChatPage.tsx'

type Json = Record<string, unknown>

function Preferences({ models }: { models: ModelOption[] }) {
  const { data, error } = useQuery(preferencesQuery)
  // The form only renders once the stored preferences load, and starts from them.
  if (data === undefined)
    return error ? <p role="alert">Could not load preferences: {messageOf(error)}</p> : null
  return <PreferencesForm initial={data ?? {}} models={models} />
}

function PreferencesForm({ initial, models }: { initial: Json; models: ModelOption[] }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (record: Json) =>
      read(api.chats.preferences.$put({}, json({ ...record, timezone: browserTimeZone() }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey }),
  })
  const stored = initial.defaultModel as { provider: string; id: string } | undefined
  const form = useForm({
    defaultValues: {
      defaultModel: stored ? modelKey(stored) : '',
      defaultEffort: String(initial.defaultEffort ?? ''),
      customInstructions: String(initial.customInstructions ?? ''),
      generateTitles: initial.generateTitles !== false,
    },
    onSubmit: ({ value }) => {
      // Fields this form does not edit, like the time zone, keep their stored values.
      const { $type: _type, updatedAt: _updated, ...record } = initial
      const picked = models.find((m) => modelKey(m) === value.defaultModel)
      // The mutation holds any error for display, so submitting never rejects.
      save.mutate({
        ...record,
        defaultModel: picked ? { provider: picked.provider, id: picked.id } : undefined,
        defaultEffort: value.defaultEffort || undefined,
        customInstructions: value.customInstructions || undefined,
        generateTitles: value.generateTitles,
      })
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h2>Preferences</h2>
      <form.Field name="defaultModel">
        {(field) => (
          <label>
            Default model
            <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}>
              <option value="">App default</option>
              {models.map((m) => (
                <option key={modelKey(m)} value={modelKey(m)}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </form.Field>
      <form.Field name="defaultEffort">
        {(field) => (
          <label>
            Default effort
            <select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}>
              <option value="">Provider default</option>
              {['none', 'low', 'medium', 'high', 'max'].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </label>
        )}
      </form.Field>
      <form.Field name="customInstructions">
        {(field) => (
          <label>
            Custom instructions
            <textarea
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="generateTitles">
        {(field) => (
          <label>
            <input
              type="checkbox"
              checked={field.state.value}
              onChange={(e) => field.handleChange(e.target.checked)}
            />{' '}
            Generate titles
          </label>
        )}
      </form.Field>
      <button type="submit">Save</button>
      {save.isSuccess && <span>Saved.</span>}
      {save.error && <p role="alert">{messageOf(save.error)}</p>}
    </form>
  )
}

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

export function ApiKeys() {
  const providers = useQuery(providersQuery)
  const credentials = useQuery(credentialsQuery)
  // Models listed by the provider for the key being added.
  const [listed, setListed] = useState<
    { id: string; name: string; capabilities: ModelOption['capabilities'] }[]
  >([])
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
      setListed([])
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
    onSuccess: (body) => setListed(body.models),
  })
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
        <form.Field name="providerId">
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
        <form.Field name="apiKey">
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
            <form.Field name="baseUrl">
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

type PluginEntry = {
  id: string
  name: string
  tools: { name: string; description: string; enabled: boolean; userToggle: boolean }[]
  schema: object | null
  values: Json
  secretFields: string[]
  secretsSet: string[]
  error: string | null
}

/** The plugin form's values: each plugin's settings and tool switches, by position. */
type PluginValues = { plugins: { values: Json; tools: boolean[] }[] }

export function PluginSettings() {
  const query = useQuery(pluginSettingsQuery)
  const queryClient = useQueryClient()
  const reload = () => queryClient.invalidateQueries({ queryKey: pluginSettingsQuery.queryKey })
  const plugins = query.data as PluginEntry[] | undefined
  const save = useMutation({
    mutationFn: async ({ plugins: edited }: PluginValues) => {
      for (const [i, plugin] of (plugins ?? []).entries()) {
        const draft = edited[i]
        if (plugin.schema && !plugin.error) {
          await read(
            api.plugins[':id'].settings.$put(
              { param: { id: plugin.id } },
              json(draft?.values ?? plugin.values),
            ),
          )
        }
        for (const [j, tool] of plugin.tools.entries()) {
          const enabled = draft?.tools[j] ?? tool.enabled
          if (!tool.userToggle || enabled === tool.enabled) continue
          await read(
            api.plugins[':id'].tools[':name'].$put(
              { param: { id: plugin.id, name: tool.name } },
              json({ enabled }),
            ),
          )
        }
      }
    },
    onSuccess: reload,
  })
  const reset = useMutation({
    mutationFn: (id: string) => read(api.plugins[':id'].settings.$delete({ param: { id } })),
    onSuccess: reload,
  })
  const error = lastError(save, reset) ?? (query.error && messageOf(query.error))
  if (!plugins?.length) return error ? <p role="alert">{error}</p> : null
  return (
    <section>
      <h2>Plugins</h2>
      <PluginForm
        // Start over from the stored values whenever they load or change.
        key={query.dataUpdatedAt}
        plugins={plugins}
        saved={save.isSuccess}
        onSave={save.mutate}
        onReset={reset.mutate}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

function PluginForm({
  plugins,
  saved,
  onSave,
  onReset,
}: {
  plugins: PluginEntry[]
  saved: boolean
  onSave: (values: PluginValues) => void
  onReset: (id: string) => void
}) {
  // Fields are addressed by position, since tool names and setting keys may contain dots.
  const form = useForm({
    defaultValues: {
      plugins: plugins.map((plugin) => ({
        values: plugin.values,
        tools: plugin.tools.map((tool) => tool.enabled),
      })),
    } as PluginValues,
    onSubmit: ({ value }) => onSave(value),
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      {plugins.map((plugin, i) => {
        const switchable = plugin.tools.flatMap((tool, j) => (tool.userToggle ? [{ tool, j }] : []))
        return (
          <fieldset key={plugin.id}>
            <legend>{plugin.name}</legend>
            {switchable.map(({ tool, j }) => (
              <form.Field key={tool.name} name={`plugins[${i}].tools[${j}]`}>
                {(field) => (
                  <label title={tool.description}>
                    <input
                      type="checkbox"
                      checked={field.state.value}
                      onChange={(e) => field.handleChange(e.target.checked)}
                    />
                    {switchable.length === 1 ? 'Enabled' : tool.name}
                  </label>
                )}
              </form.Field>
            ))}
            {plugin.error ? (
              <p role="alert">
                {plugin.error}{' '}
                <button type="button" onClick={() => onReset(plugin.id)}>
                  Reset
                </button>
              </p>
            ) : (
              plugin.schema && (
                <form.Field name={`plugins[${i}].values`}>
                  {(field) => (
                    <SchemaFields
                      schema={plugin.schema as object}
                      values={field.state.value}
                      secretFields={plugin.secretFields}
                      secretsSet={plugin.secretsSet}
                      onChange={(key, value) =>
                        field.handleChange((current) => ({ ...current, [key]: value }))
                      }
                    />
                  )}
                </form.Field>
              )
            )}
          </fieldset>
        )
      })}
      <button type="submit">Save</button>
      {saved && <span>Saved.</span>}
    </form>
  )
}

export function Device() {
  const store = useStore()
  const account = useQuery(accountQuery)
  const queryClient = useQueryClient()
  const setBackgroundSync = useMutation({
    mutationFn: (backgroundSync: boolean) =>
      read(api.chats.account.$put({}, json({ backgroundSync }))),
    onSuccess: (_result, backgroundSync) =>
      queryClient.setQueryData(
        accountQuery.queryKey,
        (current) => current && { ...current, backgroundSync },
      ),
  })
  const rebuild = useMutation({
    mutationFn: async () => {
      await store.deleteLocalCopy()
      // Reload to open a fresh copy and sync it from the server.
      location.reload()
    },
  })
  const error = lastError(setBackgroundSync, rebuild) ?? (account.error && messageOf(account.error))
  return (
    <section>
      <h2>Sync</h2>
      {account.data?.allowUserOptOut && (
        <label>
          <input
            type="checkbox"
            checked={account.data.backgroundSync}
            onChange={(e) => setBackgroundSync.mutate(e.target.checked)}
          />{' '}
          Keep my chats in sync in the background
        </label>
      )}
      <button type="button" onClick={() => rebuild.mutate()}>
        Rebuild this device's copy
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

const sections = [
  { to: '/settings', label: 'Preferences' },
  { to: '/settings/api-keys', label: 'API keys' },
  { to: '/settings/plugins', label: 'Plugins' },
  { to: '/settings/sync', label: 'Sync' },
] as const

export function PreferencesSettings() {
  const { models, error } = useModels()
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <Preferences models={models} />
    </>
  )
}

/** The settings sidebar around the current section. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const signOut = useMutation({ mutationFn: useSignOut() })
  return (
    <div className="layout settings">
      <nav className="sidebar">
        <Link to="/" activeOptions={{ exact: true }}>
          Back to chats
        </Link>
        <ul>
          {sections.map((section) => (
            <li key={section.to}>
              <Link to={section.to} activeOptions={{ exact: true }}>
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => signOut.mutate()}>
          Sign out
        </button>
        {signOut.error && <p role="alert">{messageOf(signOut.error)}</p>}
      </nav>
      <main>{children}</main>
    </div>
  )
}
