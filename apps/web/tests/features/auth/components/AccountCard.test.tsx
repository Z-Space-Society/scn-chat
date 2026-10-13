import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountCard } from '../../../../src/features/auth/components/AccountCard.tsx'
import { type Me, MeContext } from '../../../../src/features/auth/session.ts'
import { stubFetch } from '../../../helpers/fetch.ts'
import { renderAt } from '../../../helpers/router.tsx'

afterEach(() => vi.unstubAllGlobals())

const thumbnail = 'https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:alice/bafy@jpeg'

const me: Me = {
  did: 'did:plc:alice',
  handle: 'alice.test',
  storageMode: 'space',
  backgroundSync: true,
  roles: ['user'],
  admin: false,
  access: 'full',
  accessMessage: null,
}

function renderCard(profile: unknown, who: Me | null = me) {
  stubFetch(undefined, { '/api/me/profile': profile })
  return renderAt(
    <MeContext.Provider value={who}>
      <AccountCard />
    </MeContext.Provider>,
  )
}

describe('AccountCard', () => {
  it('shows the avatar, display name, and handle from the profile', async () => {
    const { container } = await renderCard({ displayName: 'Alice', avatar: thumbnail })
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('@alice.test')).toBeInTheDocument()
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', thumbnail)
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('shows the handle alone and an initial without a profile', async () => {
    const { container } = await renderCard({ displayName: null, avatar: null })
    expect(await screen.findByText('alice.test')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to the initial when the avatar fails to load', async () => {
    const { container } = await renderCard({ displayName: 'Alice', avatar: thumbnail })
    await screen.findByText('Alice')
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('shows nothing outside a signed-in session', async () => {
    await renderCard({}, null)
    expect(screen.queryByText('alice.test')).toBeNull()
    expect(screen.queryByText('A')).toBeNull()
  })
})
