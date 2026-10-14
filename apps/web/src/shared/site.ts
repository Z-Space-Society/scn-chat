import { createClientOnlyFn } from '@tanstack/react-start'

/** The app's name and description, from the admin area. */
export type Site = { appName: string; description: string }

const meta = (name: string) =>
  document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''

/** The app name, from the rendered page. On the server it comes with the request instead. */
export const appName = createClientOnlyFn((): string => meta('application-name'))

/** The site, from the rendered page. On the server it comes with the request instead. */
export const site = createClientOnlyFn(
  (): Site => ({ appName: appName(), description: meta('description') }),
)
