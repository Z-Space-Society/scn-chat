import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharePanel } from '../../../../src/features/sharing/components/SharePanel.tsx'
import { renderAt } from '../../../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

describe('SharePanel', () => {
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
    await renderAt(<SharePanel skey="3abc" ownerDid="did:plc:alice" onClose={() => {}} />)
    expect(await screen.findByDisplayValue('bob.test')).toBeInTheDocument()
    await userEvent.type(
      screen.getByLabelText('Handles of the people to share with, separated by commas'),
      ', nobody.test',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nobody.test')
  })
})
