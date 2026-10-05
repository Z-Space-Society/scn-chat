import { useSearch } from '@tanstack/react-router'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccessAdmin } from '../../src/pages/admin/access.tsx'
import { AdminLayout } from '../../src/pages/admin/layout.tsx'
import { ModelsAdmin } from '../../src/pages/admin/models.tsx'
import { NewPluginAdmin } from '../../src/pages/admin/new-plugin.tsx'
import { PluginAdmin } from '../../src/pages/admin/plugin.tsx'
import { PluginsAdmin } from '../../src/pages/admin/plugins.tsx'
import { RolesAdmin } from '../../src/pages/admin/roles.tsx'
import { SettingsAdmin } from '../../src/pages/admin/settings.tsx'
import { UsersAdmin } from '../../src/pages/admin/users.tsx'
import { renderAt } from '../helpers/router.tsx'

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
  renderAt(<AdminLayout>{section}</AdminLayout>, path)

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
})

describe('Admin roles', () => {
  it('saves a role', async () => {
    const fetch = stubServer()
    await renderPage(<RolesAdmin />, '/admin/roles')
    const member = await screen.findByRole('group', { name: 'member' })
    await userEvent.type(within(member).getByLabelText(/Handle domains/), 'example.com')
    await userEvent.click(within(member).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'PATCH', '/api/admin/roles/member')).toEqual([
        { description: 'Members', pdsHosts: ['pds.example.com'], handleDomains: ['example.com'] },
      ]),
    )
  })

  it('adds a member by handle and creates a role', async () => {
    const fetch = stubServer()
    await renderPage(<RolesAdmin />, '/admin/roles')
    await userEvent.type(await screen.findByLabelText('Add a member to member'), 'carol.test')
    await userEvent.click(
      within(screen.getByRole('group', { name: 'member' })).getByRole('button', {
        name: 'Add member',
      }),
    )
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/roles/member/members')).toEqual([
        { identifier: 'carol.test' },
      ]),
    )
    await userEvent.type(screen.getByLabelText('Role name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))
    await waitFor(() =>
      expect(callsTo(fetch, 'POST', '/api/admin/roles')).toEqual([{ name: 'x', description: '' }]),
    )
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
    // The first Name field is the plugin's. The model editors below have their own.
    const [name] = await screen.findAllByLabelText('Name')
    await userEvent.clear(name as HTMLElement)
    await userEvent.type(name as HTMLElement, 'Shared Computer')
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
