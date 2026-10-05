export const blobUrlFor = (base: string) => (cid: string, mimeType?: string) =>
  `${base}/blobs/${cid}${mimeType ? `?type=${encodeURIComponent(mimeType)}` : ''}`
