/** The app's did:web, derived from its public URL. */
export function appDid(publicUrl: string): string {
  const url = new URL(publicUrl)
  return `did:web:${encodeURIComponent(url.host)}`
}

export const SERVICE_FRAGMENT = 'scn_chat'

export const serviceId = (publicUrl: string) => `${appDid(publicUrl)}#${SERVICE_FRAGMENT}`

export function didDocument(publicUrl: string) {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: appDid(publicUrl),
    service: [
      { id: `#${SERVICE_FRAGMENT}`, type: 'AtprotoSpaceService', serviceEndpoint: publicUrl },
    ],
  }
}
