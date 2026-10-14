/** The site a URL is on, without a leading `www.`, or the URL itself when it doesn't parse. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Whether a URL is a web page's, the only kind a tool view links to. */
export function isWebUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
