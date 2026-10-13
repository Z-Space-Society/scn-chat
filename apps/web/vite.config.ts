import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Files worth compressing: text and wasm over a kilobyte. Images and fonts are compressed already. */
const COMPRESSIBLE = /\.(?:js|mjs|css|wasm|svg|json|html|txt)$/

/**
 * Writes a brotli and a gzip copy beside each compressible file of the browser build, once at
 * build time and at full strength, which the server sends to a browser that accepts them.
 */
function precompress(): Plugin {
  return {
    name: 'scn-chat:precompress',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    writeBundle(options, bundle) {
      const dir = options.dir
      if (!dir) return
      for (const fileName of Object.keys(bundle)) {
        if (!COMPRESSIBLE.test(fileName)) continue
        const path = join(dir, fileName)
        const content = readFileSync(path)
        if (content.length < 1024) continue
        writeFileSync(
          `${path}.br`,
          brotliCompressSync(content, {
            params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
          }),
        )
        writeFileSync(`${path}.gz`, gzipSync(content, { level: 9 }))
      }
    },
  }
}

// The server runs this config in middleware mode in development (apps/server/src/web.ts).
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({ router: { addExtensions: true, quoteStyle: 'single', semicolons: false } }),
    react(),
    // React Compiler memoizes components and hooks, in the browser build only.
    babel({ presets: [reactCompilerPreset()] }),
    precompress(),
  ],
  optimizeDeps: {
    // There is no index.html to scan, so scan every route up front. Otherwise a dependency found
    // only when a split route loads makes Vite re-optimize mid-load, and that route fails to import.
    entries: ['src/routes/**/*.tsx'],
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: { format: 'es' },
})
