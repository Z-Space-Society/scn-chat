import babel from '@rolldown/plugin-babel'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The server runs this config in middleware mode in development (apps/server/src/web.ts).
export default defineConfig({
  plugins: [
    tanstackStart({ router: { addExtensions: true, quoteStyle: 'single', semicolons: false } }),
    react(),
    // React Compiler memoizes components and hooks, in the browser build only.
    babel({ presets: [reactCompilerPreset()] }),
  ],
  optimizeDeps: {
    // There is no index.html to scan, so scan every route up front. Otherwise a dependency found
    // only when a split route loads makes Vite re-optimize mid-load, and that route fails to import.
    entries: ['src/routes/**/*.tsx'],
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: { format: 'es' },
})
