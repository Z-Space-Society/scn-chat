import { randomBytes } from 'node:crypto'
import { JoseKey } from '@atproto/oauth-client-node'

const key = await JoseKey.generate(['ES256'], `key-${Date.now()}`)
console.log(`OAUTH_PRIVATE_KEYS='${JSON.stringify([key.privateJwk])}'`)
console.log(`SECRET_KEY=${randomBytes(32).toString('base64')}`)
