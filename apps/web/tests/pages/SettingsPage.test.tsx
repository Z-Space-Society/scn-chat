import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiKeys,
  Device,
  PluginSettings,
  PreferencesSettings,
  SettingsLayout,
} from '../../src/pages/SettingsPage.tsx'
import type { StoreClient } from '../../src/store/client.ts'
import { StoreProvider } from '../../src/store/react.tsx'
import { renderAt } from '../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

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
  '/api-keys': ApiKeys,
  '/plugins': PluginSettings,
  '/sync': Device,
}

/** Render a settings section at its path, such as '/plugins'. */
const renderPage = (section: keyof typeof sections = '') => {
  const Section = sections[section]
  return renderAt(
    <StoreProvider store={store}>
      <SettingsLayout>
        <Section />
      </SettingsLayout>
    </StoreProvider>,
    `/settings${section}`,
  )
}

describe('SettingsPage preferences', () => {
  it('shows the load error and no form when preferences cannot be read', async () => {
    stubServer({
      '/api/preferences': () => Response.json({ error: 'InternalServerError' }, { status: 500 }),
    })
    await renderPage()
    expect(await screen.findByText(/Could not load preferences/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preferences' })).toBeNull()
  })

  it('saves a default model whose ID contains a slash', async () => {
    const fetch = stubServer({ '/api/preferences': () => Response.json({ preferences: null }) })
    await renderPage()
    await screen.findByRole('heading', { name: 'Preferences' })
    await vi.waitFor(() =>
      expect(screen.getByRole('option', { name: 'Claude' })).toBeInTheDocument(),
    )
    await userEvent.selectOptions(screen.getByLabelText('Default model'), 'router/anthropic/claude')
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

describe('SettingsPage preferences fields', () => {
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
    await vi.waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument())
    const put = fetch.mock.calls.find(
      ([url, init]) => url === '/api/preferences' && init?.method === 'PUT',
    )
    const body = JSON.parse(String(put?.[1]?.body))
    expect(body).toMatchObject({ customInstructions: 'Metric units', somethingNewer: 'kept' })
    expect(body).not.toHaveProperty('$type')
    expect(body).not.toHaveProperty('updatedAt')
  })
})

describe('SettingsPage API keys', () => {
  it('adds a key and clears the form once it is saved', async () => {
    const fetch = stubServer({
      '/api/providers': () =>
        Response.json({
          providers: [{ id: 'openai', name: 'OpenAI', userEndpoints: false, listsModels: false }],
        }),
    })
    await renderPage('/api-keys')
    await screen.findByRole('option', { name: 'OpenAI' })
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'openai')
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
    expect(screen.getByLabelText('Provider')).toHaveValue('')
  })
})

describe('SettingsPage sections', () => {
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
})

describe('SettingsPage plugins', () => {
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
    await userEvent.selectOptions(screen.getByRole('combobox'), 'kagi')
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
