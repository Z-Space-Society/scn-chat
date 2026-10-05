export function appName(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content ?? ''
}
