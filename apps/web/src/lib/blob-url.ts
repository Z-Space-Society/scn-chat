/** Build blob URLs under a conversation's API path, asking for the declared type when known. */
export const blobUrlFor = (base: string) => (cid: string, mimeType?: string) =>
  `${base}/blobs/${cid}${mimeType ? `?type=${encodeURIComponent(mimeType)}` : ''}`
