import { renderIndexHtml } from '@scn-chat/server/web-html'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const SERVER = 'http://127.0.0.1:3000'

/** Ask the dev server for the configured app name, waiting a few seconds for it to start. */
async function serverAppName(): Promise<string> {
  let failure: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const body = (await (await fetch(`${SERVER}/api/health`)).json()) as { appName?: string }
      if (body.appName) return body.appName
    } catch (err) {
      failure = err
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Cannot get the app name from the server at ${SERVER}. Is it running?`, {
    cause: failure,
  })
}

/** Fill index.html with the app name in development, as the server does in production. */
const appName = (): Plugin => ({
  name: 'scn-chat-app-name',
  apply: 'serve',
  transformIndexHtml: async (html) => renderIndexHtml(html, await serverAppName()),
})

export default defineConfig({
  plugins: [react(), appName()],
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      ['/api', '/oauth', '/oauth-client-metadata.json', '/xrpc', '/.well-known'].map((path) => [
        path,
        SERVER,
      ]),
    ),
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})
