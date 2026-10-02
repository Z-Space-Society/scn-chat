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
  const [prefs, setPrefs] = useState(initial)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => {
      const { $type: _type, updatedAt: _updated, ...record } = prefs
      return read(api.chats.preferences.$put({}, json({ ...record, timezone: browserTimeZone() })))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: preferencesQuery.queryKey }),
  })
  const set = (key: string, value: unknown) => setPrefs((p) => ({ ...p, [key]: value }))
  const model = prefs.defaultModel as { provider: string; id: string } | undefined
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <h2>Preferences</h2>
      <label>
        Default model
        <select
          value={model ? modelKey(model) : ''}
          onChange={(e) => {
            const picked = models.find((m) => modelKey(m) === e.target.value)
            set('defaultModel', picked ? { provider: picked.provider, id: picked.id } : undefined)
          }}
        >
          <option value="">App default</option>
          {models.map((m) => (
            <option key={modelKey(m)} value={modelKey(m)}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Default effort
        <select
          value={String(prefs.defaultEffort ?? '')}
          onChange={(e) => set('defaultEffort', e.target.value || undefined)}
        >
          <option value="">Provider default</option>
          {['none', 'low', 'medium', 'high', 'max'].map((level) => (
            <option key={level}>{level}</option>
          ))}
        </select>
      </label>
      <label>
        Custom instructions
        <textarea
          value={String(prefs.customInstructions ?? '')}
          onChange={(e) => set('customInstructions', e.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={prefs.generateTitles !== false}
          onChange={(e) => set('generateTitles', e.target.checked)}
        />{' '}
        Generate titles
      </label>
      <button type="submit">Save</button>
      {save.isSuccess && <span>Saved.</span>}
      {save.error && <p role="alert">{messageOf(save.error)}</p>}
    </form>
  )
}

const emptyDraft = { providerId: '', apiKey: '', name: '', slug: '', baseUrl: '', models: '' }

export function ApiKeys() {
  const providers = useQuery(providersQuery)
  const credentials = useQuery(credentialsQuery)
  const [draft, setDraft] = useState(emptyDraft)
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
  const provider = providers.data?.find((p) => p.id === draft.providerId)
  const none = { vision: false, reasoning: false, tools: false }

  const add = useMutation({
    mutationFn: () => {
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
      setDraft(emptyDraft)
      setListed([])
      return keysChanged()
    },
  })
  const remove = useMutation({
    mutationFn: (id: string) => read(api.providers.credentials[':id'].$delete({ param: { id } })),
    onSuccess: keysChanged,
  })
  const listModels = useMutation({
    mutationFn: () =>
      read(
        api.providers.providers[':id']['list-models'].$post(
          { param: { id: draft.providerId } },
          json({ apiKey: draft.apiKey, baseUrl: draft.baseUrl || undefined }),
        ),
      ),
    onSuccess: (body) => setListed(body.models),
  })
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
          add.mutate()
        }}
      >
        <select
          aria-label="Provider"
          value={draft.providerId}
          onChange={(e) => setDraft({ ...draft, providerId: e.target.value })}
          required
        >
          <option value="">Choose a provider</option>
          {(providers.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          aria-label="API key"
          type="password"
          placeholder="API key"
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
          required
        />
        <input
          aria-label="Name"
          placeholder="Name (optional)"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {provider?.userEndpoints && (
          <>
            <input
              aria-label="Base URL"
              placeholder="https://host/v1"
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
            <input
              aria-label="Slug"
              placeholder="my-endpoint"
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
            />
          </>
        )}
        {provider?.listsModels && (
          <button type="button" onClick={() => listModels.mutate()}>
            Load models
          </button>
        )}
        {listed.length > 0 && <span>{listed.length} models loaded</span>}
        <input
          aria-label="Model IDs"
          placeholder="Model IDs, separated by commas"
          value={draft.models}
          onChange={(e) => setDraft({ ...draft, models: e.target.value })}
        />
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

type PluginChanges = { drafts: Record<string, Json>; switches: Record<string, boolean> }

export function PluginSettings() {
  const query = useQuery(pluginSettingsQuery)
  const queryClient = useQueryClient()
  const reload = () => queryClient.invalidateQueries({ queryKey: pluginSettingsQuery.queryKey })
  const plugins = query.data as PluginEntry[] | undefined
  const save = useMutation({
    mutationFn: async ({ drafts, switches }: PluginChanges) => {
      for (const plugin of plugins ?? []) {
        if (plugin.schema && !plugin.error) {
          const values = drafts[plugin.id] ?? plugin.values
          await read(api.plugins[':id'].settings.$put({ param: { id: plugin.id } }, json(values)))
        }
        for (const tool of plugin.tools) {
          const enabled = switches[tool.name] ?? tool.enabled
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
  onSave: (changes: PluginChanges) => void
  onReset: (id: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Json>>(() =>
    Object.fromEntries(plugins.map((plugin) => [plugin.id, plugin.values])),
  )
  const [switches, setSwitches] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      plugins.flatMap((plugin) => plugin.tools.map((tool) => [tool.name, tool.enabled])),
    ),
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ drafts, switches })
      }}
    >
      {plugins.map((plugin) => {
        const switchable = plugin.tools.filter((tool) => tool.userToggle)
        const values = drafts[plugin.id] ?? plugin.values
        return (
          <fieldset key={plugin.id}>
            <legend>{plugin.name}</legend>
            {switchable.map((tool) => (
              <label key={tool.name} title={tool.description}>
                <input
                  type="checkbox"
                  checked={switches[tool.name] ?? tool.enabled}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setSwitches((current) => ({ ...current, [tool.name]: enabled }))
                  }}
                />
                {switchable.length === 1 ? 'Enabled' : tool.name}
              </label>
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
                <SchemaFields
                  schema={plugin.schema}
                  values={values}
                  secretFields={plugin.secretFields}
                  secretsSet={plugin.secretsSet}
                  onChange={(key, value) =>
                    setDrafts((current) => ({
                      ...current,
                      [plugin.id]: { ...values, [key]: value },
                    }))
                  }
                />
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
