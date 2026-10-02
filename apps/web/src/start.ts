import { createStart } from '@tanstack/react-start'

/** What the server passes with each request. See WebContext in apps/server/src/app.ts. */
export type RequestContext = { appName: string }

declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: RequestContext }
  }
}

// Chats live in the browser's local copy, so routes render on the client unless they opt in.
export const startInstance = createStart(() => ({ defaultSsr: false }))
