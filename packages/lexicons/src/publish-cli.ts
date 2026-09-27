import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { IdResolver } from '@atproto/identity'
import { Client, type DidString } from '@atproto/lex-client'
import { PasswordSession } from '@atproto/lex-password-session'
import { checkDns, loadLexicons, publishLexicons } from './publish.ts'

const usage = `Usage: pnpm publish-lexicons [--dry-run] <handle-or-did>

Publishes every lexicon in lexicons/ to the account's repo as com.atproto.lexicon.schema
records. Sign in with an app password, from LEXICON_APP_PASSWORD or the prompt.`

/** Read a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process
  if (!stdin.isTTY) throw new Error('No terminal to prompt on. Set LEXICON_APP_PASSWORD instead.')
  stdout.write(question)
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()
  let input = ''
  return new Promise((resolve, reject) => {
    const finish = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
    }
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0003') {
          finish()
          return ch === '\u0003' ? reject(new Error('Cancelled')) : resolve(input)
        }
        input = ch === '\u007f' ? input.slice(0, -1) : input + ch
      }
    }
    stdin.on('data', onData)
  })
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean' } },
})
const identifier = positionals[0]
if (values.help || !identifier) {
  console.log(usage)
  process.exit(values.help ? 0 : 1)
}

const resolver = new IdResolver()
const did = identifier.startsWith('did:') ? identifier : await resolver.handle.resolve(identifier)
if (!did) throw new Error(`Cannot resolve the handle ${identifier}`)
const { pds } = await resolver.did.resolveAtprotoData(did)

const docs = await loadLexicons(fileURLToPath(new URL('../../../lexicons', import.meta.url)))
console.log(`Publishing ${docs.length} lexicons as ${did} on ${pds}`)
const dnsProblems = await checkDns(
  did,
  docs.map((doc) => doc.id),
)
for (const problem of dnsProblems) console.warn(`DNS: ${problem}`)

const dryRun = values['dry-run']
const session = dryRun
  ? null
  : await PasswordSession.login({
      service: pds,
      identifier,
      password: process.env.LEXICON_APP_PASSWORD || (await promptHidden('App password: ')),
    })
try {
  const client = new Client(session ?? { service: pds })
  const results = await publishLexicons(client, did as DidString, docs, { dryRun })
  for (const { nsid, status } of results) console.log(`${status.padEnd(9)} ${nsid}`)
  if (dryRun) console.log('Dry run: nothing was written.')
} finally {
  await session?.logout()
}
