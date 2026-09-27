import { describe, expect, it } from 'vitest'
import { appDid, didDocument, serviceId } from '../../src/sync/identity.ts'

describe('app identity', () => {
  it('derives a did:web from the public URL, encoding a port', () => {
    expect(appDid('https://chat.example.com')).toBe('did:web:chat.example.com')
    expect(appDid('http://localhost:3000')).toBe('did:web:localhost%3A3000')
  })

  it('names the service with the #scn_chat fragment', () => {
    expect(serviceId('https://chat.example.com')).toBe('did:web:chat.example.com#scn_chat')
  })

  it('publishes one AtprotoSpaceService entry pointing at the public URL', () => {
    expect(didDocument('https://chat.example.com')).toEqual({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:web:chat.example.com',
      service: [
        {
          id: '#scn_chat',
          type: 'AtprotoSpaceService',
          serviceEndpoint: 'https://chat.example.com',
        },
      ],
    })
  })
})
