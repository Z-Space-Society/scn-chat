/** The configured app name, from the meta tag the root route renders on the server. */
export function appName(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content ?? ''
}
