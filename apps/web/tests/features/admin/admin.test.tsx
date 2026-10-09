import { useSearch } from '@tanstack/react-router'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode, Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessAdmin } from '../../../src/features/admin/pages/AccessAdmin.tsx'
import { AdminLayout } from '../../../src/features/admin/pages/AdminLayout.tsx'
import { ApiKeysAdmin } from '../../../src/features/admin/pages/ApiKeysAdmin.tsx'
import { CronAdmin } from '../../../src/features/admin/pages/CronAdmin.tsx'
import { ModelAdmin } from '../../../src/features/admin/pages/ModelAdmin.tsx'
import { ModelsAdmin } from '../../../src/features/admin/pages/ModelsAdmin.tsx'
import { NewPluginAdmin } from '../../../src/features/admin/pages/NewPluginAdmin.tsx'
import { PluginAdmin } from '../../../src/features/admin/pages/PluginAdmin.tsx'
import { PluginsAdmin } from '../../../src/features/admin/pages/PluginsAdmin.tsx'
import { RoleAdmin } from '../../../src/features/admin/pages/RoleAdmin.tsx'
import { RolesAdmin } from '../../../src/features/admin/pages/RolesAdmin.tsx'
import { SettingsAdmin } from '../../../src/features/admin/pages/SettingsAdmin.tsx'
import { UsersAdmin } from '../../../src/features/admin/pages/UsersAdmin.tsx'
import { renderAt } from '../../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

const caps = { vision: false, reasoning: false, tools: false }

const roles = {
  roles: [
    {
      name: 'admin',
      description: 'Can use the admin area.',
      builtIn: true,
      pdsHosts: [],
      handleDomains: [],
      members: [],
    },
    {
      name: 'member',
      description: 'Members',
      builtIn: false,
      pdsHosts: ['pds.example.com'],
      handleDomains: [],
      members: [{ did: 'did:plc:bob', handle: 'bob.test', addedAt: '', addedBy: '' }],
    },
  ],
  environmentAdmins: ['did:plc:boss'],
}

const instance = {
  id: 'i1',
  package: '@scn-chat/plugin-openai-compatible',
  name: 'SCN',
  enabled: true,
  options: { id: 'scn', name: 'SCN' },
  secretFields: ['apiKey'],
  secretsSet: ['apiKey'],
  schema: {
    properties: {
      id: { type: 'string', title: 'Provider ID' },
      name: { type: 'string', title: 'Name' },
      apiKey: { type: 'string', title: 'API key' },
    },
  },
  providers: [{ id: 'scn', name: 'SCN', hasAdminKey: true, listsModels: true }],
  status: 'loaded',
  error: null,
  issues: [],
}

const searchInstance = {
  ...instance,
  id: 'i2',
  package: '@scn-chat/plugin-web-search',
  name: 'Web search',
  options: { engine: 'duckduckgo' },
  secretFields: [],
  secretsSet: [],
  schema: { properties: {} },
  providers: [],
  status: 'failed',
  error: 'Invalid options for "@scn-chat/plugin-web-search"',
}

type Handler = (init?: RequestInit) => Response

/** A server answering every admin route, with overrides by method and path. */
function stubServer(overrides: Record<string, Handler> = {}) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = String(url)
    const key = `${init?.method ?? 'GET'} ${path}`
    if (overrides[key]) return overrides[key](init)
    if (path.startsWith('/api/admin/users'))
      return Response.json({
        users: [
          {
            did: 'did:plc:bob',
            handle: 'bob.test',
            storageMode: 'space',
            viewerOnly: false,
            suspension: null,
            lastActiveAt: '2026-01-01T00:00:00Z',
            roles: [
              { role: 'member', source: 'member' },
              { role: 'member', source: 'pds:pds.example.com' },
            ],
          },
        ],
        cursor: path.includes('cursor') ? null : '50',
      })
    if (path === '/api/admin/roles') return Response.json(roles)
    if (path === '/api/admin/invites')
      return Response.json({
        invites: [{ did: 'did:plc:dana', handle: null, addedBy: 'did:plc:boss', addedAt: '' }],
      })
    if (path === '/api/admin/access')
      return Response.json({ registration: 'open', inviteRoles: [] })
    if (path === '/api/admin/plugins')
      return Response.json({ instances: [instance, searchInstance] })
    if (path === '/api/admin/plugins/installed')
      return Response.json({
        plugins: [
          {
            package: '@scn-chat/plugin-titles',
            description: 'Writes titles.',
            schema: { properties: { maxWords: { type: 'integer', title: 'Most words' } } },
            secretFields: [],
            multiple: false,
          },
          {
            package: '@scn-chat/plugin-openai-compatible',
            description: 'Any endpoint.',
            schema: { properties: {} },
            secretFields: [],
            multiple: true,
          },
          {
            package: '@scn-chat/plugin-web-search',
            description: 'Search.',
            schema: { properties: {} },
            secretFields: [],
            multiple: false,
          },
        ],
      })
    if (path === '/api/admin/models')
      return Response.json({
        models: [
          {
            provider: 'scn',
            id: 'qwen',
            name: 'Qwen',
            capabilities: caps,
            roles: ['user'],
            default: true,
            warning: null,
          },
          {
            provider: 'scn',
            id: 'llama',
            name: 'Llama',
            capabilities: caps,
            roles: ['user'],
            default: false,
            warning: 'Provider "scn" is not loaded.',
          },
        ],
      })
    if (path === '/api/admin/api-keys')
      return Response.json({
        keys: [
          {
            id: 'k1',
            label: 'old',
            roles: ['admin'],
            createdBy: 'did:plc:boss',
            createdAt: '2026-01-01T00:00:00Z',
            lastUsedAt: null,
          },
        ],
      })
    if (path === '/api/admin/cron') return Response.json({ lastRun: null })
    if (path === '/api/admin/settings')
      return Response.json({
        settings: [
          {
            key: 'general',
            schema: { properties: { appName: { type: 'string', title: 'App name' } } },
            value: { appName: 'SCN Chat' },
          },
          {
            key: 'sessions',
            schema: {
              properties: { ttlDays: { type: 'integer', title: 'Days a web session lasts' } },
            },
            value: { ttlDays: 30 },
          },
          {
            key: 'turns',
            schema: {
              properties: {
                systemPrompt: { type: 'string', title: 'System prompt', multiline: true },
              },
            },
            value: { systemPrompt: 'Hi' },
          },
          { key: 'sync', schema: { properties: {} }, value: {} },
        ],
      })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const callsTo = (fetch: ReturnType<typeof stubServer>, method: string, path: string) =>
  fetch.mock.calls
    .filter(([url, init]) => String(url) === path && (init?.method ?? 'GET') === method)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : undefined))

/** The users section, searching by `q` from the URL as its route does. */
function Users() {
  const { q } = useSearch({ strict: false }) as { q?: string }
  return <UsersAdmin q={q ?? ''} />
}

/** Render an admin section in the admin layout at its path, such as '/admin/roles'. */
const renderPage = (section: ReactNode, path: string) =>
  renderAt(
    <AdminLayout>
      {/* The boundary the section's route gives it, so the layout shows while it loads. */}
      <Suspense>{section}</Suspense>
    </AdminLayout>,
    path,
  )

describe('Admin layout', () => {
  it('links to each section and marks the plugins section on a plugin page', async () => {
    stubServer()
    await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Back to chats' })).toHaveAttribute('href', '/')
    expect(within(nav).getByRole('link', { name: 'Account settings' })).toHaveAttribute(
      'href',
      '/settings',
    )
    expect(within(nav).getByRole('link', { name: 'Roles' })).toHaveAttribute('href', '/admin/roles')
    expect(within(nav).getByRole('link', { name: 'Plugins' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1)
  })
})

describe('Admin users', () => {
  it('loads the next page of users', async () => {
    const fetch = stubServer()
    await renderPage(<Users />, '/admin/users')
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).includes('cursor=50'))).toBe(true),
    )
  })

  it('searches, adds a user to a role, and removes an explicit membership', async () => {
    const fetch = stubServer()
    const { router } = await renderPage(<Users />, '/admin/users')
    await screen.findByText('did:plc:bob')
    await userEvent.type(screen.getByLabelText('Search users'), 'bo')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url) === '/api/admin/users?q=bo')).toBe(true),
    )
    expect(router.state.location.search).toEqual({ q: 'bo' })
    await userEvent.selectOptions(screen.getByLabelText('Add bob.test to a role'), 'member')
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/roles/member/members')).toEqual([
        { identifier: 'did:plc:bob' },
      ]),
    )
    const row = screen.getByRole('row', { name: /did:plc:bob/ })
    await userEvent.click(within(row).getAllByRole('button', { name: 'Remove' })[0] as HTMLElement)
    await waitFor(() =>
      expect(callsTo(fetch, 'DELETE', '/api/admin/roles/member/members/did:plc:bob')).toHaveLength(
        1,
      ),
    )
  })
  it('keeps the search box focused after a search', async () => {
    stubServer()
    const { router } = await renderPage(<Users />, '/admin/users')
    await userEvent.type(await screen.findByLabelText('Search users'), ' bo {Enter}')
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'bo' }))
    expect(screen.getByLabelText('Search users')).toHaveFocus()
    expect(screen.getByLabelText('Search users')).toHaveValue('bo')
  })

  it('empties the search box when the sidebar link clears the search', async () => {
    stubServer()
    await renderPage(<Users />, '/admin/users?q=bo')
    expect(await screen.findByLabelText('Search users')).toHaveValue('bo')
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'Users' }),
    )
    await waitFor(() => expect(screen.getByLabelText('Search users')).toHaveValue(''))
  })
})

describe('Admin roles', () => {
  it('links each role in the summary to its page', async () => {
    stubServer()
    await renderPage(<RolesAdmin />, '/admin/roles')
    expect(await screen.findByRole('link', { name: 'member' })).toHaveAttribute(
      'href',
      '/admin/roles/member',
    )
  })

  it('saves a role', async () => {
    const fetch = stubServer()
    await renderPage(<RoleAdmin name="member" />, '/admin/roles/member')
    await userEvent.type(await screen.findByLabelText(/Handle domains/), 'example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PATCH', '/api/admin/roles/member')).toEqual([
        { description: 'Members', pdsHosts: ['pds.example.com'], handleDomains: ['example.com'] },
      ]),
    )
  })

  it('adds a member by handle', async () => {
    const fetch = stubServer()
    await renderPage(<RoleAdmin name="member" />, '/admin/roles/member')
    await userEvent.type(await screen.findByLabelText('Add a member to member'), 'carol.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/roles/member/members')).toEqual([
        { identifier: 'carol.test' },
      ]),
    )
  })

  it('creates a role and opens its page', async () => {
    const fetch = stubServer()
    const { router } = await renderPage(<RolesAdmin />, '/admin/roles')
    await userEvent.type(await screen.findByLabelText('Role name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/roles/x'))
    expect(callsTo(fetch, 'POST', '/api/admin/roles')).toEqual([{ name: 'x', description: '' }])
  })

  it('deletes a role and goes back to the list', async () => {
    const fetch = stubServer()
    const { router } = await renderPage(<RoleAdmin name="member" />, '/admin/roles/member')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete role' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/roles'))
    expect(callsTo(fetch, 'DELETE', '/api/admin/roles/member')).toHaveLength(1)
  })
})

describe('Admin access', () => {
  it('saves the registration mode, with invite roles in invite mode', async () => {
    const fetch = stubServer()
    await renderPage(<AccessAdmin />, '/admin/access')
    expect(screen.queryByRole('group', { name: 'Invite roles' })).toBeNull()
    await userEvent.click(await screen.findByRole('radio', { name: /^Invite/ }))
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Invite roles' })).getByRole('checkbox', {
        name: 'member',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/access')).toEqual([
        { registration: 'invite', inviteRoles: ['member'] },
      ]),
    )
  })
})

describe('Admin added users and suspension', () => {
  it('adds a user and removes one who has not signed in', async () => {
    const fetch = stubServer()
    await renderPage(<Users />, '/admin/users')
    expect(await screen.findByText(/did:plc:dana/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Add a user'), 'erin.test')
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/users')).toEqual([{ identifier: 'erin.test' }]),
    )
    const dana = screen.getByText(/did:plc:dana/).closest('li') as HTMLElement
    await userEvent.click(within(dana).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'DELETE', '/api/admin/invites/did:plc:dana')).toHaveLength(1),
    )
  })

  it('suspends an account with a reason', async () => {
    const fetch = stubServer()
    await renderPage(<Users />, '/admin/users')
    await userEvent.type(await screen.findByLabelText('Reason for suspending bob.test'), 'Spam')
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/users/did:plc:bob/suspend')).toEqual([
        { reason: 'Spam' },
      ]),
    )
  })

  it('restores a suspended account', async () => {
    const fetch = stubServer({
      'GET /api/admin/users?q=': () =>
        Response.json({
          users: [
            {
              did: 'did:plc:bob',
              handle: 'bob.test',
              storageMode: 'space',
              viewerOnly: false,
              suspension: { at: '', by: 'plugin:members', reason: 'Application revoked' },
              lastActiveAt: '2026-01-01T00:00:00Z',
              roles: [],
            },
          ],
          cursor: null,
        }),
    })
    await renderPage(<Users />, '/admin/users')
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/users/did:plc:bob/restore')).toHaveLength(1),
    )
  })
})

describe('Admin plugin list', () => {
  it('reorders plugins', async () => {
    const fetch = stubServer()
    await renderPage(<PluginsAdmin />, '/admin/plugins')
    await screen.findByRole('link', { name: 'SCN' })
    await userEvent.click(screen.getAllByRole('button', { name: 'Down' })[0] as HTMLElement)
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/plugins/order')).toEqual([{ ids: ['i2', 'i1'] }]),
    )
  })
})

describe('Admin plugin page', () => {
  it('saves a plugin with its options, clearing a secret', async () => {
    const fetch = stubServer()
    await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    const name = await screen.findByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Shared Computer')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Clear' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/plugins/i1')).toEqual([
        {
          options: { id: 'scn', name: 'Shared Computer' },
          enabled: true,
          clearSecrets: ['apiKey'],
        },
      ]),
    )
  })

  it('drops stored options the plugin no longer has when saving', async () => {
    const fetch = stubServer({
      'GET /api/admin/plugins': () =>
        Response.json({
          instances: [{ ...instance, options: { ...instance.options, pollMinutes: 5 } }],
        }),
    })
    await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/plugins/i1')[0]?.options).toEqual({
        id: 'scn',
        name: 'SCN',
      }),
    )
  })

  it('shows the server issues next to their fields', async () => {
    stubServer({
      'PUT /api/admin/plugins/i1': () =>
        Response.json(
          {
            error: 'InvalidRequest',
            message: 'Invalid options',
            issues: [{ path: ['id'], message: 'Invalid string' }],
          },
          { status: 400 },
        ),
    })
    await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Invalid string')).toBeInTheDocument()
  })

  it('lists a provider models from the form values and offers a ticked one', async () => {
    const fetch = stubServer({
      'POST /api/admin/plugins/list-models': () =>
        Response.json({
          models: [{ provider: 'scn', id: 'gemma', name: 'Gemma', capabilities: caps }],
        }),
    })
    await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh model list' }))
    expect(callsTo(fetch, 'POST', '/api/admin/plugins/list-models')).toEqual([
      {
        package: '@scn-chat/plugin-openai-compatible',
        instanceId: 'i1',
        options: { id: 'scn', name: 'SCN' },
      },
    ])
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Gemma (gemma)' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/models')).toEqual([
        {
          provider: 'scn',
          id: 'gemma',
          name: 'Gemma',
          capabilities: caps,
          roles: ['user'],
          default: false,
        },
      ]),
    )
  })

  it('removes the plugin and goes back to the list', async () => {
    const fetch = stubServer()
    const { router } = await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove plugin' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/plugins'))
    expect(callsTo(fetch, 'DELETE', '/api/admin/plugins/i1')).toHaveLength(1)
  })
})

describe('Admin model page', () => {
  const llama = {
    provider: 'scn',
    id: 'meta/llama3:8b',
    name: 'Llama 3',
    capabilities: caps,
    roles: ['user'],
    default: false,
    warning: null,
  }
  const serveLlama = () =>
    stubServer({ 'GET /api/admin/models': () => Response.json({ models: [llama] }) })
  const renderModel = () =>
    renderPage(
      <ModelAdmin pluginId="i1" provider="scn" modelId="meta/llama3:8b" />,
      '/admin/plugins/i1/model',
    )

  it("opens a model from its plugin's summary, keeping the slashes and colons in its ID", async () => {
    serveLlama()
    const { router } = await renderPage(<PluginAdmin id="i1" />, '/admin/plugins/i1')
    await userEvent.click(await screen.findByRole('link', { name: 'Llama 3' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/plugins/i1/model'))
    expect(router.state.location.search).toEqual({ provider: 'scn', id: 'meta/llama3:8b' })
  })

  it('saves a model', async () => {
    const fetch = serveLlama()
    await renderModel()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'tools' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/models')).toEqual([
        { ...llama, warning: undefined, capabilities: { ...caps, tools: true } },
      ]),
    )
  })

  it('removes a model and goes back to its plugin', async () => {
    const fetch = serveLlama()
    const { router } = await renderModel()
    await userEvent.click(await screen.findByRole('button', { name: 'Remove model' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/plugins/i1'))
    expect(callsTo(fetch, 'DELETE', '/api/admin/models')).toEqual([
      { provider: 'scn', id: 'meta/llama3:8b' },
    ])
  })
})

describe('Admin adding a plugin', () => {
  it('offers only packages that are not added yet, or can be added more than once', async () => {
    stubServer()
    await renderPage(<NewPluginAdmin />, '/admin/plugins/new')
    const picker = await screen.findByLabelText('Plugin package')
    await waitFor(() =>
      expect(
        within(picker)
          .getAllByRole('option')
          .map((o) => o.getAttribute('value'))
          .filter(Boolean),
      ).toEqual(['@scn-chat/plugin-titles', '@scn-chat/plugin-openai-compatible']),
    )
  })

  it('adds a plugin with its options and opens its page', async () => {
    const fetch = stubServer({
      'POST /api/admin/plugins': () => Response.json({ id: 'new1' }, { status: 201 }),
    })
    const { router } = await renderPage(<NewPluginAdmin />, '/admin/plugins/new')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))
    await userEvent.selectOptions(
      screen.getByLabelText('Plugin package'),
      '@scn-chat/plugin-titles',
    )
    await userEvent.type(screen.getByLabelText('Most words'), '6')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/plugins/new1'))
    expect(callsTo(fetch, 'POST', '/api/admin/plugins')).toEqual([
      { package: '@scn-chat/plugin-titles', options: { maxWords: 6 } },
    ])
  })
})

describe('Admin models', () => {
  it('marks a new default and reorders', async () => {
    const fetch = stubServer()
    await renderPage(<ModelsAdmin />, '/admin/models')
    await userEvent.click(await screen.findByRole('radio', { name: 'Llama (scn/llama)' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/models')).toEqual([
        {
          provider: 'scn',
          id: 'llama',
          name: 'Llama',
          capabilities: caps,
          roles: ['user'],
          default: true,
        },
      ]),
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Up' })[1] as HTMLElement)
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/models/order')).toEqual([
        {
          models: [
            { provider: 'scn', id: 'llama' },
            { provider: 'scn', id: 'qwen' },
          ],
        },
      ]),
    )
  })
})

describe('Admin API keys', () => {
  it('issues a key, shows it once, and revokes one', async () => {
    const fetch = stubServer({
      'POST /api/admin/api-keys': () =>
        Response.json({ id: 'k2', key: 'scn_secret' }, { status: 201 }),
    })
    await renderPage(<ApiKeysAdmin />, '/admin/api-keys')
    await userEvent.type(await screen.findByLabelText('Key label'), 'crontab')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'admin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Issue key' }))
    expect(await screen.findByText('scn_secret')).toBeInTheDocument()
    expect(callsTo(fetch, 'POST', '/api/admin/api-keys')).toEqual([
      { label: 'crontab', roles: ['admin'] },
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(callsTo(fetch, 'DELETE', '/api/admin/api-keys/k1')).toHaveLength(1))
  })
})

describe('Admin cron', () => {
  it('warns when cron has never run', async () => {
    stubServer()
    await renderPage(<CronAdmin />, '/admin/cron')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cron has never run')
  })
})

describe('Admin settings', () => {
  it('saves the general settings, each group on its own', async () => {
    const fetch = stubServer()
    await renderPage(
      <SettingsAdmin title="General" keys={['general', 'sessions']} />,
      '/admin/general',
    )
    await userEvent.clear(await screen.findByLabelText('App name'))
    await userEvent.type(screen.getByLabelText('App name'), 'My Chat')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PUT', '/api/admin/settings/general')).toEqual([
        { appName: 'My Chat' },
      ]),
    )
    expect(callsTo(fetch, 'PUT', '/api/admin/settings/sessions')).toEqual([{ ttlDays: 30 }])
  })

  it('starts over from the stored settings once saved, still saying Saved', async () => {
    // The server stores the app name trimmed.
    let appName = 'SCN Chat'
    stubServer({
      'GET /api/admin/settings': () =>
        Response.json({
          settings: [
            {
              key: 'general',
              schema: { properties: { appName: { type: 'string', title: 'App name' } } },
              value: { appName },
            },
          ],
        }),
      'PUT /api/admin/settings/general': (init) => {
        appName = (JSON.parse(String(init?.body)) as { appName: string }).appName.trim()
        return Response.json({ ok: true })
      },
    })
    await renderPage(<SettingsAdmin title="General" keys={['general']} />, '/admin/general')
    await userEvent.clear(await screen.findByLabelText('App name'))
    await userEvent.type(screen.getByLabelText('App name'), '  My Chat  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByLabelText('App name')).toHaveValue('My Chat'))
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it("shows a failed group's issues next to its fields, and edits the system prompt as text", async () => {
    stubServer({
      'PUT /api/admin/settings/turns': () =>
        Response.json(
          {
            error: 'InvalidRequest',
            message: 'Invalid turns',
            issues: [{ path: ['systemPrompt'], message: 'Too long' }],
          },
          { status: 400 },
        ),
    })
    await renderPage(<SettingsAdmin title="Turns" keys={['turns']} />, '/admin/turns')
    const prompt = await screen.findByLabelText('System prompt')
    expect(prompt.tagName).toBe('TEXTAREA')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Too long')).toBeInTheDocument()
    expect(screen.queryByText('Saved.')).toBeNull()
  })
})
