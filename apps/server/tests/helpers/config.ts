import { loadConfig } from '../../src/config.ts'

export const TEST_SECRET_KEY = Buffer.alloc(32, 1).toString('base64')

/** A test config: env holds secrets and overrides, file holds config.yml's contents. */
export function testConfig(env: Record<string, string> = {}, file: Record<string, unknown> = {}) {
  return loadConfig({
    env: { NODE_ENV: 'test', SECRET_KEY: TEST_SECRET_KEY, ...env },
    file: { app: { name: 'Test Chat' }, ...file },
  })
}
