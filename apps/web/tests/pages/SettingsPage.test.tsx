import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../../src/pages/SettingsPage.tsx'
import type { StoreClient } from '../../src/store/client.ts'
import { StoreProvider } from '../../src/store/react.tsx'

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

const renderPage = () =>
  render(
    <StoreProvider store={store}>
      <SettingsPage />
    </StoreProvider>,
  )

describe('SettingsPage preferences', () => {
  it('shows the load error and no form when preferences cannot be read', async () => {
    stubServer({
      '/api/preferences': () => Response.json({ error: 'InternalServerError' }, { status: 500 }),
    })
    renderPage()
    expect(await screen.findByText(/Could not load preferences/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Preferences' })).toBeNull()
  })

  it('saves a default model whose ID contains a slash', async () => {
    const fetch = stubServer({ '/api/preferences': () => Response.json({ preferences: null }) })
    renderPage()
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
})
