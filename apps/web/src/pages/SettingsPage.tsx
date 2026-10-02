import { Link } from '@tanstack/react-router'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, json, read } from '../api.ts'
import { type ModelOption, modelKey } from '../components/Composer.tsx'
import { SchemaFields } from '../components/SchemaFields.tsx'
import { useAction } from '../components/useAction.ts'
import { useSignOut } from '../components/useSignOut.ts'
import { browserTimeZone } from '../lib/time-zone.ts'
import { useStore } from '../store/react.tsx'
import { useModels } from './ChatPage.tsx'

type Json = Record<string, unknown>

function Preferences({ models }: { models: ModelOption[] }) {
  // Null until the stored preferences load, and the form only renders after that.
  const [prefs, setPrefs] = useState<Json | null>(null)
  const [saved, setSaved] = useState(false)
  const { error, run } = useAction()
  useEffect(() => {
    run(async () => {
      const body = await read(api.chats.preferences.$get())
      setPrefs((body.preferences as Json | null) ?? {})
    })
  }, [run])
  if (!prefs) return error ? <p role="alert">Could not load preferences: {error}</p> : null
  const set = (key: string, value: unknown) => setPrefs((p) => ({ ...p, [key]: value }))
  const model = prefs.defaultModel as { provider: string; id: string } | undefined
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const { $type: _type, updatedAt: _updated, ...record } = prefs
        setSaved(false)
        run(async () => {
          await read(
            api.chats.preferences.$put({}, json({ ...record, timezone: browserTimeZone() })),
          )
          setSaved(true)
        })
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
      {saved && <span>Saved.</span>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export function ApiKeys() {
  const [providers, setProviders] = useState<
    { id: string; name: string; userEndpoints: boolean; listsModels: boolean }[]
  >([])
  const [credentials, setCredentials] = useState<
    { id: string; providerId: string; name: string | null; slug: string | null; keyHint: string }[]
  >([])
  const [draft, setDraft] = useState({
    providerId: '',
    apiKey: '',
    name: '',
    slug: '',
    baseUrl: '',
    models: '',
  })
  const [listed, setListed] = useState<
    { id: string; name: string; capabilities: ModelOption['capabilities'] }[]
  >([])
  const { error, run } = useAction()
  const reload = useCallback(
    () =>
      run(async () => setCredentials((await read(api.providers.credentials.$get())).credentials)),
    [run],
  )
  useEffect(() => {
    run(async () => setProviders((await read(api.providers.providers.$get())).providers))
    reload()
  }, [run, reload])
  const provider = providers.find((p) => p.id === draft.providerId)
  const none = { vision: false, reasoning: false, tools: false }

  const add = async () => {
    const typed = draft.models
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id, name: id, capabilities: none }))
    await read(
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
    setDraft({ providerId: '', apiKey: '', name: '', slug: '', baseUrl: '', models: '' })
    setListed([])
    reload()
  }

  return (
    <section>
      <h2>API keys</h2>
      <ul>
        {credentials.map((c) => (
          <li key={c.id}>
            {c.name ?? c.slug ?? c.providerId} ending {c.keyHint}{' '}
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  await read(api.providers.credentials[':id'].$delete({ param: { id: c.id } }))
                  reload()
                })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(add)
        }}
      >
        <select
          aria-label="Provider"
          value={draft.providerId}
          onChange={(e) => setDraft({ ...draft, providerId: e.target.value })}
          required
        >
          <option value="">Choose a provider</option>
          {providers.map((p) => (
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
          <button
            type="button"
            onClick={() =>
              run(async () => {
                const body = await read(
                  api.providers.providers[':id']['list-models'].$post(
                    { param: { id: draft.providerId } },
                    json({ apiKey: draft.apiKey, baseUrl: draft.baseUrl || undefined }),
                  ),
                )
                setListed(body.models)
              })
            }
          >
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

export function PluginSettings() {
  type Entry = {
    id: string
    name: string
    tools: { name: string; description: string; enabled: boolean; userToggle: boolean }[]
    schema: object | null
    values: Json
    secretFields: string[]
    secretsSet: string[]
    error: string | null
  }
  const [plugins, setPlugins] = useState<Entry[]>([])
  const [drafts, setDrafts] = useState<Record<string, Json>>({})
  const [switches, setSwitches] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const { error, run } = useAction()
  const reload = useCallback(
    () =>
      run(async () => {
        const loaded = (await read(api.plugins.settings.$get())).plugins as Entry[]
        setPlugins(loaded)
        setDrafts(Object.fromEntries(loaded.map((plugin) => [plugin.id, plugin.values])))
        setSwitches(
          Object.fromEntries(
            loaded.flatMap((plugin) => plugin.tools.map((tool) => [tool.name, tool.enabled])),
          ),
        )
      }),
    [run],
  )
  useEffect(reload, [reload])
  if (plugins.length === 0) return error ? <p role="alert">{error}</p> : null
  const save = () =>
    run(async () => {
      setSaved(false)
      for (const plugin of plugins) {
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
      reload()
      setSaved(true)
    })
  return (
    <section>
      <h2>Plugins</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
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
                  <button
                    type="button"
                    onClick={() =>
                      run(async () => {
                        await read(
                          api.plugins[':id'].settings.$delete({ param: { id: plugin.id } }),
                        )
                        reload()
                      })
                    }
                  >
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
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export function Device() {
  const store = useStore()
  const [account, setAccount] = useState<{
    backgroundSync: boolean
    allowUserOptOut: boolean
  } | null>(null)
  const { error, run } = useAction()
  useEffect(() => {
    run(async () => setAccount(await read(api.chats.account.$get())))
  }, [run])
  return (
    <section>
      <h2>Sync</h2>
      {account?.allowUserOptOut && (
        <label>
          <input
            type="checkbox"
            checked={account.backgroundSync}
            onChange={(e) => {
              const backgroundSync = e.target.checked
              run(async () => {
                await read(api.chats.account.$put({}, json({ backgroundSync })))
                setAccount({ ...account, backgroundSync })
              })
            }}
          />{' '}
          Keep my chats in sync in the background
        </label>
      )}
      <button
        type="button"
        onClick={() =>
          run(async () => {
            await store.deleteLocalCopy()
            // Reload to open a fresh copy and sync it from the server.
            location.reload()
          })
        }
      >
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
  const signOut = useSignOut()
  const { error, run } = useAction()
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
        <button type="button" onClick={() => run(signOut)}>
          Sign out
        </button>
        {error && <p role="alert">{error}</p>}
      </nav>
      <main>{children}</main>
    </div>
  )
}
