import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareControl } from '../../../../src/features/sharing/components/ShareControl.tsx'
import { renderAt } from '../../../helpers/router.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ShareControl', () => {
  it('loads the current settings and shows why saving failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? Response.json(
              { error: 'InvalidRequest', message: 'Cannot find the handle "nobody.test"' },
              { status: 400 },
            )
          : Response.json({
              mode: 'people',
              members: [{ did: 'did:plc:bob', handle: 'bob.test' }],
            }),
      ),
    )
    await renderAt(<ShareControl skey="3abc" ownerDid="did:plc:alice" />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByDisplayValue('bob.test')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('People'), ', nobody.test')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nobody.test')
  })

  it('shows why the settings failed to load, without a form that could save over them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'InternalError', message: 'The PDS is down' }, { status: 502 }),
      ),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderAt(<ShareControl skey="3abc" ownerDid="did:plc:alice" />)
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The PDS is down')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })
})
