import { createClientOnlyFn } from '@tanstack/react-start'

/** The app name, from the rendered page. On the server it comes with the request instead. */
export const appName = createClientOnlyFn(
  (): string =>
    document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content ?? '',
)
