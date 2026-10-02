# TanStack Start runs inside the Hono server

The web app is built on TanStack Start with SSR, but Hono stays the process owner and treats Start as a fetch handler: Hono answers `/api`, `/oauth`, `/xrpc`, and `/.well-known`, serves Start's built client assets, and hands every other request to Start's built `fetch`. In development the same Hono entry runs Vite in middleware mode instead. We chose this over the documented Start-outside layout because importing the server into Start's build bundles our workspace packages, puts runtime plugin loading through `import()` inside a bundle, and reloads the sync timers, database handles, and notify renewers on every HMR. Hono and the plugins keep running unbundled on Node's type stripping.

## Consequences

- Hono stays the only API. There are no Start server functions, so auth, origin checks, and error mapping live in one place. During SSR, loaders reach Hono in process through the request context, never by importing server code.
- Only the shell, login, settings, and the session redirect are server-rendered. Chat and shared routes are `ssr: false`, since their data lives in the browser's local copy, and rendering them on the server would mean reading chats from the PDS on every navigation.
- The dev setup depends on Start's undocumented `installDevServerMiddleware` option, so Start is pinned to an exact version. If it disappears, the fallback is importing Start's server entry through Vite's SSR runner, as the plugin does internally.
