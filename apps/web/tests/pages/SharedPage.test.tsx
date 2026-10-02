import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SharedPage } from '../../src/pages/SharedPage.tsx'
import { renderAt } from '../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const message = (rkey: string, role: string, text: string, parent?: string) => ({
  rkey,
  cid: `c-${rkey}`,
  value: {
    role,
    createdAt: '2026-09-26T00:00:00Z',
    content: { $type: d('plainContent'), parts: [{ $type: d('textPart'), text }] },
    ...(parent ? { parent, status: 'complete' } : {}),
  },
})

describe('SharedPage', () => {
  it('shows the shared conversation and lets the viewer switch between replies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          owner: { did: 'did:plc:alice', handle: 'alice.test' },
          title: 'Tile quotes',
          messages: [
            message('u', 'user', 'How much for tiles?'),
            message('u.r0', 'assistant', 'About $500', 'u'),
            message('u.r1', 'assistant', 'Roughly $450', 'u'),
          ],
        }),
      ),
    )
    await renderAt(<SharedPage ownerDid="did:plc:alice" skey="3abc" signedIn />)
    expect(await screen.findByRole('heading', { name: 'Tile quotes' })).toBeInTheDocument()
    expect(screen.getByText('Shared by alice.test')).toBeInTheDocument()
    expect(screen.getByText('Roughly $450')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '‹' }))
    expect(screen.getByText('About $500')).toBeInTheDocument()
  })

  it('asks a signed-out viewer to sign in, returning to the shared link', async () => {
    await renderAt(<SharedPage ownerDid="did:plc:alice" skey="3abc" signedIn={false} />)
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toMatch(
      /^\/login\?next=/,
    )
  })
})
