import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 30_000,
          include: [
            'packages/*/tests/**/*.test.ts',
            'apps/server/tests/**/*.test.ts',
            'plugins/*/tests/**/*.test.ts',
          ],
        },
      },
      'apps/web',
    ],
  },
})
