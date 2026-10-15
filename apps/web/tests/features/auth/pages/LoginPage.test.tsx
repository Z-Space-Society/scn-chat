import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../../../../src/features/auth/pages/LoginPage.tsx'
import { createQueryClient } from '../../../../src/router.tsx'

const withQueries = (props: { children: ReactNode }) => (
  <QueryClientProvider client={createQueryClient()}>{props.children}</QueryClientProvider>
)

const renderPage = (error?: string) =>
  render(<LoginPage appName="SCN Chat" description="Chat with any model." error={error} />, {
    wrapper: withQueries,
  })

const field = () => screen.getByRole('combobox')

/** Bluesky's typeahead, answering with these accounts for any search. */
function stubSearch(actors: object[]) {
  const fetch = vi.fn(async (_url: string) => Response.json({ actors }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const alice = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: 'https://cdn.bsky.app/img/avatar/plain/did:plc:alice/bafy@jpeg',
}
const alicia = { did: 'did:plc:alicia', handle: 'alicia.example.com' }

afterEach(() => vi.unstubAllGlobals())

describe('LoginPage', () => {
  it('starts OAuth with the handle', () => {
    const { container } = renderPage()
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('action', '/oauth/login')
    expect(field()).toHaveAttribute('name', 'identifier')
  })

  it('names the app', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SCN Chat')
  })

  it('shows a sign-in error from the server on the field', () => {
    renderPage('invalid_scope')
    expect(screen.getByRole('alert')).toHaveTextContent('invalid_scope')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(field()).toHaveAccessibleDescription('invalid_scope')
  })

  it('shows it is busy once submitted', () => {
    const { container } = renderPage()
    // jsdom doesn't navigate, so submitting only runs the handler.
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button')).toHaveTextContent('Signing in…')
    expect(screen.getByRole('button').querySelectorAll('svg')).toHaveLength(1)
  })
})

describe('Handle search', () => {
  it('suggests accounts as you type, and puts the one clicked in the field', async () => {
    const fetch = stubSearch([alice, alicia])
    renderPage()
    await userEvent.type(field(), '@ali')
    const options = await screen.findAllByRole('option')
    // Alice has an avatar, and Alicia only the first letter of her handle in its place.
    expect(options.map((option) => option.textContent)).toEqual([
      'Alice@alice.bsky.social',
      'A@alicia.example.com',
    ])
    const url = new URL(fetch.mock.calls.at(-1)?.[0] ?? '')
    expect(url.origin).toBe('https://public.api.bsky.app')
    expect(url.searchParams.get('q')).toBe('ali')
    // The list loads the avatar's thumbnail rather than the full upload.
    expect(options[0]?.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:alice/bafy@jpeg',
    )
    await userEvent.click(options[1] as HTMLElement)
    expect(field()).toHaveValue('alicia.example.com')
    expect(field()).toHaveFocus()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('picks with the arrow keys and Enter, and closes with Escape', async () => {
    stubSearch([alice, alicia])
    const { container } = renderPage()
    const submit = vi.fn((event: Event) => event.preventDefault())
    container.querySelector('form')?.addEventListener('submit', submit)
    await userEvent.type(field(), 'ali')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(field()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id)
    await userEvent.keyboard('{Enter}')
    expect(field()).toHaveValue('alicia.example.com')
    expect(submit).not.toHaveBeenCalled()

    await userEvent.type(field(), 'x')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    // With nothing picked, Enter signs in with what was typed.
    await userEvent.keyboard('{Enter}')
    expect(submit).toHaveBeenCalled()
  })

  it("doesn't search for a DID", async () => {
    const fetch = stubSearch([alice])
    renderPage()
    await userEvent.type(field(), 'did:plc:alice')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('shows the avatar of the account picked in the field until it is edited', async () => {
    stubSearch([alice])
    renderPage()
    await userEvent.type(field(), 'ali')
    await userEvent.click(await screen.findByRole('option'))
    // The avatar sits beside the field, not in the list.
    const mark = () => field().parentElement?.querySelector(':scope > img')
    expect(mark()).toHaveAttribute('src', expect.stringContaining('avatar_thumbnail'))
    await userEvent.type(field(), 'x')
    expect(mark()).toBeNull()
  })

  it('counts the accounts found for screen readers', async () => {
    stubSearch([alice, alicia])
    renderPage()
    await userEvent.type(field(), 'ali')
    expect(await screen.findByText('2 accounts found')).toHaveClass('sr-only')
  })

  it('shows skeletons once a search takes a while', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()
    await userEvent.type(field(), 'ali')
    expect(screen.queryByText('Searching accounts')).toBeNull()
    expect(await screen.findByText('Searching accounts', {}, { timeout: 1500 })).toBeVisible()
  })

  it('says when no account matches', async () => {
    stubSearch([])
    renderPage()
    await userEvent.type(field(), 'zzz')
    expect(await screen.findByText(/No accounts found/)).toBeVisible()
    expect(field()).toHaveAttribute('aria-expanded', 'false')
  })

  it('says when the search fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    )
    renderPage()
    await userEvent.type(field(), 'ali')
    expect(await screen.findByText(/Couldn't search for accounts/)).toBeVisible()
  })
})
