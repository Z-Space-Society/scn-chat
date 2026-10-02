import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareControl } from '../../src/components/ShareControl.tsx'

afterEach(() => vi.unstubAllGlobals())

describe('ShareControl', () => {
  it('loads the current members and saves them with the added handle', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? Response.json({ ok: true })
        : Response.json({
            mode: 'people',
            members: [{ did: 'did:plc:bob', handle: 'bob.test' }],
          }),
    )
    vi.stubGlobal('fetch', fetch)
    render(<ShareControl skey="3abc" ownerDid="did:plc:alice" />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    await screen.findByDisplayValue('bob.test')
    await userEvent.type(screen.getByLabelText('People'), ', carol.test')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => {
      const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        mode: 'people',
        members: ['bob.test', 'carol.test'],
      })
    })
  })
})
