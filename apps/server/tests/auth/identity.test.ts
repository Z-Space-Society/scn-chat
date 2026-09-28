import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createIdentityResolver } from '../../src/auth/identity.ts'
import { PrivateNetworkError } from '../../src/providers/guarded-fetch.ts'

const resolveData = vi.fn()
const resolveHandle = vi.fn()

vi.mock('@atproto/identity', () => ({
  IdResolver: class {
    did = { resolveAtprotoData: resolveData, resolveAtprotoKey: vi.fn() }
    handle = { resolve: resolveHandle }
  },
}))

beforeEach(() => {
  resolveData.mockReset().mockResolvedValue({ pds: 'https://pds.test', handle: 'alice.test' })
  resolveHandle.mockReset()
})

describe('createIdentityResolver', () => {
  it('keeps a handle only when it resolves back to the same DID', async () => {
    resolveHandle.mockResolvedValue('did:plc:alice')
    expect(await createIdentityResolver().resolve('did:plc:alice')).toEqual({
      did: 'did:plc:alice',
      handle: 'alice.test',
      pdsUrl: 'https://pds.test',
    })
    resolveHandle.mockResolvedValue('did:plc:someone-else')
    expect((await createIdentityResolver().resolve('did:plc:alice')).handle).toBeNull()
  })

  it('refuses a did:web on a private network address without fetching it', async () => {
    await expect(createIdentityResolver().resolve('did:web:10.0.0.5')).rejects.toBeInstanceOf(
      PrivateNetworkError,
    )
    expect(resolveData).not.toHaveBeenCalled()
  })

  it('allows private addresses when configured to, for a local PDS', async () => {
    resolveHandle.mockResolvedValue('did:web:127.0.0.1%3A2583')
    const identity = createIdentityResolver(undefined, { allowPrivateNetworks: true })
    await expect(identity.resolve('did:web:127.0.0.1%3A2583')).resolves.toMatchObject({
      pdsUrl: 'https://pds.test',
    })
  })
})
