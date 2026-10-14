import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Me, MeContext } from '../../../src/features/auth/session.ts'
import { ApiKeyModelSettings } from '../../../src/features/settings/pages/ApiKeyModelSettings.tsx'
import { ApiKeySettings } from '../../../src/features/settings/pages/ApiKeySettings.tsx'
import { PluginSettings } from '../../../src/features/settings/pages/PluginSettings.tsx'
import { PreferencesSettings } from '../../../src/features/settings/pages/PreferencesSettings.tsx'
import { SettingsLayout } from '../../../src/features/settings/pages/SettingsLayout.tsx'
import { SyncSettings } from '../../../src/features/settings/pages/SyncSettings.tsx'
import type { StoreClient } from '../../../src/store/client.ts'
import { StoreProvider } from '../../../src/store/react.tsx'
import { renderAt } from '../../helpers/router.tsx'
import { choose } from '../../helpers/select.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const store = {
  state: () => 'active',
  onState: () => () => {},
  onChange: () => () => {},
  deleteLocalCopy: vi.fn(async () => {}),
} as unknown as StoreClient

const caps = { vision: false, reasoning: false, tools: false }

/** A server that answers each settings route, with overrides for some paths. */
function stubServer(overrides: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    const path = String(url)
    if (overrides[path]) return overrides[path]()
    if (path === '/api/models')
      return Response.json({
        models: [
          { provider: 'router', id: 'anthropic/claude', name: 'Claude', capabilities: caps },
        ],
        defaultModel: null,
      })
    if (path === '/api/credentials') return Response.json({ credentials: [] })
    if (path === '/api/providers') return Response.json({ providers: [] })
    if (path === '/api/plugins/settings') return Response.json({ plugins: [] })
    if (path === '/api/account')
      return Response.json({ backgroundSync: true, allowUserOptOut: false })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const sections = {
  '': PreferencesSettings,
  '/api-keys': ApiKeySettings,
  '/api-keys/k1': () => <ApiKeyModelSettings id="k1" />,
  '/plugins': PluginSettings,
  '/sync': SyncSettings,
}

const me: Me = {
  did: 'did:plc:alice',
  handle: 'alice',
  storageMode: 'local',
  backgroundSync: true,
  roles: ['user'],
  admin: false,
  access: 'full',
  accessMessage: null,
}

/** Render a settings section at its path, such as '/plugins'. */
const renderPage = (section: keyof typeof sections = '', admin = false) => {
  const Section = sections[section]
  return renderAt(
    <MeContext.Provider value={{ ...me, admin }}>
      <StoreProvider store={store}>
        <SettingsLayout>
          {/* The boundary the section's route gives it, so the layout shows while it loads. */}
          <Suspense>
            <Section />
          </Suspense>
        </SettingsLayout>
      </StoreProvider>
    </MeContext.Provider>,
    `/settings${section}`,
  )
}

describe('Settings preferences', () => {
  it('shows the load error and no form when preferences cannot be read', async () => {
    stubServer({
      '/api/preferences': () => Response.json({ error: 'InternalServerError' }, { status: 500 }),
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('InternalServerError')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preferences' })).toBeNull()
  })

  it('saves a default model whose ID contains a slash', async () => {
    const fetch = stubServer({ '/api/preferences': () => Response.json({ preferences: null }) })
    await renderPage()
    await choose(await screen.findByLabelText('Default model'), 'Claude')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement)
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      defaultModel: { provider: 'router', id: 'anthropic/claude' },
    })
  })

  it("saves the browser's time zone with the preferences", async () => {
    const fetch = stubServer({ '/api/preferences': () => Response.json({ preferences: null }) })
    await renderPage()
    await screen.findByRole('heading', { name: 'Preferences' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement)
    await vi.waitFor(() =>
      expect(
        fetch.mock.calls.find(
          ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
        ),
      ).toBeDefined(),
    )
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(put?.[1]?.body)).timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
  })
})

describe('Settings preferences fields', () => {
  it('shows and keeps a default model the list no longer offers', async () => {
    const fetch = stubServer({
      '/api/preferences': () =>
        Response.json({ preferences: { defaultModel: { provider: 'gone', id: 'old' } } }),
    })
    await renderPage()
    // The select holds a skeleton until the models load.
    await vi.waitFor(() =>
      expect(screen.getByLabelText('Default model')).toHaveTextContent('Unavailable: gone/old'),
    )
    await userEvent.type(screen.getByLabelText('Custom instructions'), 'Metric units')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement)
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      defaultModel: { provider: 'gone', id: 'old' },
      customInstructions: 'Metric units',
    })
  })

  it('starts from the stored preferences and keeps the ones the form does not show', async () => {
    const fetch = stubServer({
      '/api/preferences': () =>
        Response.json({
          preferences: {
            $type: 'network.sharedcomputer.chat.preferences',
            updatedAt: '2026-01-01T00:00:00.000Z',
            customInstructions: 'Metric units',
            somethingNewer: 'kept',
          },
        }),
    })
    await renderPage()
    expect(await screen.findByLabelText('Custom instructions')).toHaveValue('Metric units')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save' })[0] as HTMLElement)
    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
    )
    const body = JSON.parse(String(put?.[1]?.body))
    expect(body).toMatchObject({ customInstructions: 'Metric units', somethingNewer: 'kept' })
    expect(body).not.toHaveProperty('$type')
    expect(body).not.toHaveProperty('updatedAt')
  })

  it('shows the theme picked for this device at once and keeps it here, without saving', async () => {
    const fetch = stubServer({})
    await renderPage()
    const theme = await screen.findByRole('combobox', { name: 'Theme' })
    expect(theme).toHaveTextContent('System')
    await choose(theme, 'Dark')
    expect(theme).toHaveTextContent('Dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('scn-chat:theme')).toBe('dark')
    await choose(theme, 'System')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('scn-chat:theme')).toBeNull()
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })
})

const workKey = {
  id: 'k1',
  providerId: 'openai',
  name: 'Work',
  slug: null,
  baseUrl: null,
  keyHint: 'abcd',
  keyUnreadable: false,
  models: [{ id: 'gpt', name: 'GPT', capabilities: caps }],
}

describe('Settings API keys', () => {
  it('adds a key and clears the form once it is saved', async () => {
    const fetch = stubServer({
      '/api/providers': () =>
        Response.json({
          providers: [{ id: 'openai', name: 'OpenAI', userEndpoints: false, listsModels: false }],
        }),
    })
    await renderPage('/api-keys')
    await choose(await screen.findByRole('combobox', { name: 'Provider' }), 'OpenAI')
    await userEvent.type(screen.getByLabelText('API key'), 'sk-test')
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }))
    await vi.waitFor(() => expect(screen.getByLabelText('API key')).toHaveValue(''))
    const post = fetch.mock.calls.find(
      ([url, init]) => url === '/api/credentials' && init?.method === 'POST',
    )
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      providerId: 'openai',
      apiKey: 'sk-test',
      models: [],
    })
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent(
      'Choose a provider',
    )
  })
  it('drops the models loaded for one provider when another is chosen', async () => {
    const fetch = stubServer({
      '/api/providers': () =>
        Response.json({
          providers: [
            { id: 'openai', name: 'OpenAI', userEndpoints: false, listsModels: true },
            { id: 'mistral', name: 'Mistral', userEndpoints: false, listsModels: true },
          ],
        }),
      '/api/providers/openai/list-models': () =>
        Response.json({ models: [{ id: 'gpt', name: 'GPT', capabilities: caps }] }),
    })
    await renderPage('/api-keys')
    await choose(await screen.findByRole('combobox', { name: 'Provider' }), 'OpenAI')
    await userEvent.type(screen.getByLabelText('API key'), 'sk-test')
    await userEvent.click(screen.getByRole('button', { name: 'Load models' }))
    expect(await screen.findByText('1 model loaded')).toBeInTheDocument()
    await choose(screen.getByRole('combobox', { name: 'Provider' }), 'Mistral')
    expect(screen.queryByText('1 model loaded')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }))
    await vi.waitFor(() => expect(screen.getByLabelText('API key')).toHaveValue(''))
    const post = fetch.mock.calls.find(
      ([url, init]) => url === '/api/credentials' && init?.method === 'POST',
    )
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ providerId: 'mistral', models: [] })
  })

  it('deletes a stored key and drops it from the list', async () => {
    let credentials = [workKey]
    const fetch = stubServer({
      '/api/credentials': () => Response.json({ credentials }),
      '/api/credentials/k1': () => {
        credentials = []
        return Response.json({ ok: true })
      },
    })
    await renderPage('/api-keys')
    expect(await screen.findByRole('link', { name: 'Work' })).toHaveAttribute(
      'href',
      '/settings/api-keys/k1',
    )
    expect(screen.getByText('1 model')).toBeInTheDocument()
    expect(screen.getByTitle("The key's last four characters")).toHaveTextContent('ending abcd')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
    expect(screen.getByText('Delete this key?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete key' }))
    await vi.waitFor(() => expect(screen.queryByText('Work')).toBeNull())
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url),
    ).toEqual(['/api/credentials/k1'])
  })
})

/** A server holding the Work key, whose provider lists its models. */
const stubKey = (overrides: Record<string, () => Response> = {}) =>
  stubServer({
    '/api/credentials': () => Response.json({ credentials: [workKey] }),
    '/api/providers': () =>
      Response.json({
        providers: [{ id: 'openai', name: 'OpenAI', userEndpoints: false, listsModels: true }],
      }),
    '/api/credentials/k1': () => Response.json({ credential: workKey }),
    ...overrides,
  })

/** The models the last save sent, if any. */
function patchedModels(fetch: ReturnType<typeof stubServer>) {
  const patch = fetch.mock.calls.findLast(([, init]) => init?.method === 'PATCH')
  if (!patch) return undefined
  expect(patch[0]).toBe('/api/credentials/k1')
  return (JSON.parse(String(patch[1]?.body)) as { models: { id: string }[] }).models
}

describe("Settings for one API key's models", () => {
  it('saves what each model can do, leaving the key alone', async () => {
    const fetch = stubKey()
    await renderPage('/api-keys/k1')
    expect(await screen.findByRole('heading', { name: 'Work' })).toBeInTheDocument()
    // A key's page counts as the API keys section.
    expect(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'API keys' }),
    ).toHaveAttribute('aria-current', 'page')
    const gpt = screen.getByRole('group', { name: 'What GPT can do' })
    await userEvent.click(within(gpt).getByRole('button', { name: 'Tools' }))
    await userEvent.click(within(gpt).getByRole('button', { name: 'Thinking' }))
    expect(within(gpt).getByRole('button', { name: 'Tools' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(patchedModels(fetch)).toEqual([
      { id: 'gpt', name: 'GPT', capabilities: { vision: false, reasoning: true, tools: true } },
    ])
  })

  it('adds a typed model and removes one, saving them together', async () => {
    const fetch = stubKey()
    await renderPage('/api-keys/k1')
    await userEvent.type(await screen.findByLabelText('Model ID'), 'gpt-mini{Enter}')
    expect(screen.getByLabelText('Model ID')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Remove GPT' }))
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(patchedModels(fetch)).toBeDefined())
    expect(patchedModels(fetch)).toEqual([{ id: 'gpt-mini', name: 'gpt-mini', capabilities: caps }])
  })

  it("ticks models from the provider's list, loaded with the saved key", async () => {
    const fetch = stubKey({
      '/api/credentials/k1/list-models': () =>
        Response.json({
          models: [
            { id: 'gpt', name: 'GPT', capabilities: caps },
            { id: 'o9', name: 'o9', capabilities: caps },
          ],
        }),
    })
    await renderPage('/api-keys/k1')
    await userEvent.click(await screen.findByRole('button', { name: 'Load models' }))
    expect(await screen.findByRole('checkbox', { name: 'GPT gpt' })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'o9' }))
    expect(screen.getByRole('group', { name: 'What o9 can do' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(patchedModels(fetch)?.map((m) => m.id)).toEqual(['gpt', 'o9']))
  })

  it('unticking a listed model takes it out of the draft, as removing it does', async () => {
    stubKey({
      '/api/credentials/k1/list-models': () =>
        Response.json({ models: [{ id: 'gpt', name: 'GPT', capabilities: caps }] }),
    })
    await renderPage('/api-keys/k1')
    await userEvent.click(await screen.findByRole('button', { name: 'Load models' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'GPT gpt' }))
    expect(screen.queryByRole('group', { name: 'What GPT can do' })).toBeNull()
    expect(screen.getByText(/No models/)).toBeInTheDocument()
  })

  it("asks for a key that can't be read anymore to be added again", async () => {
    stubKey({
      '/api/credentials': () =>
        Response.json({ credentials: [{ ...workKey, keyUnreadable: true }] }),
    })
    await renderPage('/api-keys/k1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This key can't be read anymore. Delete it and add it again.",
    )
  })

  it("won't save a key with no models", async () => {
    stubKey()
    await renderPage('/api-keys/k1')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove GPT' }))
    expect(screen.getByText(/No models/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it("says so when the key isn't saved anymore", async () => {
    stubServer({})
    await renderPage('/api-keys/k1')
    expect(await screen.findByRole('alert')).toHaveTextContent("This key isn't saved anymore.")
  })
})

describe('Settings sections', () => {
  it('links to each section from the sidebar and marks the current one', async () => {
    stubServer({})
    await renderPage('/plugins')
    const nav = screen.getByRole('navigation')
    expect(screen.getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'API keys' })).toHaveAttribute(
      'href',
      '/settings/api-keys',
    )
    expect(screen.getByRole('link', { name: 'Plugins' })).toHaveAttribute('aria-current', 'page')
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it('shows only the current section', async () => {
    stubServer({})
    await renderPage('/sync')
    expect(await screen.findByRole('heading', { name: 'Sync' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preferences' })).toBeNull()
  })

  it('opens on preferences', async () => {
    stubServer({ '/api/preferences': () => Response.json({ preferences: null }) })
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
  })

  it('links to the admin area for admins only', async () => {
    stubServer({})
    const { unmount } = await renderPage('/sync')
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull()
    unmount()
    await renderPage('/sync', true)
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
  })
})

describe('Settings plugins', () => {
  const tool = (name: string, userToggle = true) => ({
    name,
    description: `The ${name} tool`,
    enabled: true,
    userToggle,
  })
  const plugin = (id: string, fields: object) => ({
    id,
    name: id,
    tools: [],
    schema: null,
    values: {},
    secretFields: [],
    secretsSet: [],
    error: null,
    ...fields,
  })
  const search = plugin('web-search', {
    tools: [tool('web_search')],
    schema: { properties: { engine: { type: 'string', enum: ['default', 'kagi'] } } },
    values: { engine: 'default' },
  })
  const fetcher = plugin('web-fetch', { tools: [tool('web_fetch'), tool('forced', false)] })

  const puts = (fetch: ReturnType<typeof stubServer>) =>
    fetch.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([url, init]) => [url, JSON.parse(String(init?.body))])

  it('says so when no plugin has settings for the user, instead of showing nothing', async () => {
    stubServer({})
    await renderPage('/plugins')
    expect(await screen.findByRole('heading', { name: 'Plugins' })).toBeInTheDocument()
    expect(screen.getByText('No plugins have settings for you yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it("labels a plugin's one switchable tool Enabled, and hides tools users cannot switch", async () => {
    stubServer({ '/api/plugins/settings': () => Response.json({ plugins: [fetcher] }) })
    await renderPage('/plugins')
    const group = await screen.findByRole('group', { name: 'web-fetch' })
    expect(group.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'Enabled' })).toBeChecked()
  })

  it('labels switchable tools by name when a plugin has several', async () => {
    const both = plugin('tools', { tools: [tool('one'), tool('two')] })
    stubServer({ '/api/plugins/settings': () => Response.json({ plugins: [both] }) })
    await renderPage('/plugins')
    expect(await screen.findByRole('checkbox', { name: 'one' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'two' })).toBeInTheDocument()
  })

  it('saves every plugin and only the changed switches with one Save at the end', async () => {
    const fetch = stubServer({
      '/api/plugins/settings': () => Response.json({ plugins: [search, fetcher] }),
    })
    await renderPage('/plugins')
    const fetchGroup = await screen.findByRole('group', { name: 'web-fetch' })
    await choose(screen.getByRole('combobox'), 'kagi')
    await userEvent.click(fetchGroup.querySelector('input[type="checkbox"]') as HTMLElement)
    expect(puts(fetch)).toEqual([])
    const saveButtons = screen.getAllByRole('button', { name: 'Save' })
    expect(saveButtons).toHaveLength(1)
    await userEvent.click(saveButtons[0] as HTMLElement)
    await vi.waitFor(() =>
      expect(puts(fetch)).toEqual([
        ['/api/plugins/web-search/settings', { engine: 'kagi' }],
        ['/api/plugins/web-fetch/tools/web_fetch', { enabled: false }],
      ]),
    )
  })
})

describe('Settings sync', () => {
  const account = (allowUserOptOut: boolean) => ({
    '/api/account': () => Response.json({ backgroundSync: true, allowUserOptOut }),
  })
  const syncSwitch = { name: 'Keep chats in sync in the background' }

  it('hides the background sync switch when the admin does not allow opting out', async () => {
    const fetch = stubServer(account(false))
    await renderPage('/sync')
    await screen.findByRole('heading', { name: 'Sync' })
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === '/api/account')).toBe(true),
    )
    expect(screen.queryByRole('checkbox', syncSwitch)).toBeNull()
  })

  it('shows the background sync switch with the account setting when opting out is allowed', async () => {
    stubServer(account(true))
    await renderPage('/sync')
    expect(await screen.findByRole('checkbox', syncSwitch)).toBeChecked()
  })

  it('saves the account setting when the background sync switch is turned off', async () => {
    const fetch = stubServer(account(true))
    await renderPage('/sync')
    await userEvent.click(await screen.findByRole('checkbox', syncSwitch))
    await vi.waitFor(() => expect(screen.getByRole('checkbox', syncSwitch)).not.toBeChecked())
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/account' && init?.method === 'PUT',
    )
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ backgroundSync: false })
  })
})
