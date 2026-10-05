import { loadConfig } from '../../src/config.ts'

export const TEST_SECRET_KEY = Buffer.alloc(32, 1).toString('base64')

/** The admin every test config lists in ADMIN_DIDS. */
export const TEST_ADMIN = 'did:plc:admin'

/** A test config from the environment, with the secrets and an admin filled in. */
export function testConfig(env: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    SECRET_KEY: TEST_SECRET_KEY,
    ADMIN_DIDS: TEST_ADMIN,
    ...env,
  })
}
