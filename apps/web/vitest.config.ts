import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Compiled as in the browser build, so tests run the code that ships.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})
