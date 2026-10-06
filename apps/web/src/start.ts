import { createStart } from '@tanstack/react-start'

/** What the server passes with each request. See WebContext in apps/server/src/app.ts. */
export type RequestContext = { appName: string; fetch: typeof fetch }

declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: RequestContext }
  }
}

// Routes render on the server unless they opt out. The chat routes do, since chats live in the
// browser's local copy.
export const startInstance = createStart(() => ({ defaultSsr: true }))
