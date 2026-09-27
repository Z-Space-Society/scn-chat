import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LexError } from '@atproto/lex-data'
import { describe, expect, it } from 'vitest'
import {
  checkDns,
  type LexiconDoc,
  lexiconDnsName,
  loadLexicons,
  publishLexicons,
  SCHEMA_COLLECTION,
} from '../src/publish.ts'

const did = 'did:plc:publisher'
const lexiconsDir = fileURLToPath(new URL('../../../lexicons', import.meta.url))

const doc = (id: string, description = 'x'): LexiconDoc =>
  ({ lexicon: 1, id, defs: { main: { type: 'token', description } } }) as LexiconDoc

/** A repo holding schema records by rkey, recording each put. */
function fakeRepo(records: Record<string, unknown> = {}, getError?: Error) {
  const puts: { rkey: string; value: unknown; repo?: string }[] = []
  const client = {
    getRecord: async (_collection: string, rkey: string) => {
      if (getError) throw getError
      if (!(rkey in records)) throw new LexError('RecordNotFound', 'not found')
      return { body: { value: records[rkey] } }
    },
    putRecord: async (value: unknown, rkey: string, options?: { repo?: string }) => {
      puts.push({ rkey, value, repo: options?.repo })
      return { body: {} }
    },
  }
  return { client: client as never, puts }
}

describe('loadLexicons', () => {
  it('loads our lexicons and skips the vendored upstream ones', async () => {
    const ids = (await loadLexicons(lexiconsDir)).map((d) => d.id)
    expect(ids).toContain('network.sharedcomputer.chat.conversation')
    expect(ids.filter((id) => id.startsWith('com.atproto.'))).toEqual([])
  })

  it('refuses a JSON file that is not a lexicon', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scn-lexicons-'))
    writeFileSync(join(dir, 'typo.json'), JSON.stringify({ lexicon: '1', id: 'a.b.c' }))
    await expect(loadLexicons(dir)).rejects.toThrow(/typo\.json is not a version 1 lexicon/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('lexiconDnsName', () => {
  it('reverses the NSID authority under _lexicon', () => {
    expect(lexiconDnsName('network.sharedcomputer.chat.info')).toBe(
      '_lexicon.chat.sharedcomputer.network',
    )
  })
})

describe('checkDns', () => {
  const nsids = ['network.sharedcomputer.chat.info', 'network.sharedcomputer.chat.message']

  it('reports nothing when the record names the DID', async () => {
    expect(await checkDns(did, nsids, async () => [[`did=${did}`]])).toEqual([])
  })

  it('joins TXT chunks before reading the DID', async () => {
    expect(await checkDns(did, nsids, async () => [['did=did:plc:', 'publisher']])).toEqual([])
  })

  it('reports a missing record once per authority', async () => {
    const missing = Object.assign(new Error('no'), { code: 'ENOTFOUND' })
    const problems = await checkDns(did, nsids, async () => {
      throw missing
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`_lexicon.chat.sharedcomputer.network TXT "did=${did}"`)
  })

  it('reports a record that names another DID', async () => {
    const problems = await checkDns(did, nsids, async () => [['did=did:plc:other']])
    expect(problems[0]).toContain('points at did:plc:other')
  })

  it('rethrows unexpected DNS failures', async () => {
    const failure = Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })
    await expect(
      checkDns(did, nsids, async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
  })
})

describe('publishLexicons', () => {
  it('creates missing records as schema records keyed by NSID', async () => {
    const { client, puts } = fakeRepo()
    const results = await publishLexicons(client, did, [doc('a.b.c')])
    expect(results).toEqual([{ nsid: 'a.b.c', status: 'created' }])
    expect(puts).toEqual([
      { rkey: 'a.b.c', repo: did, value: { ...doc('a.b.c'), $type: SCHEMA_COLLECTION } },
    ])
  })

  it('updates records whose content changed', async () => {
    const { client, puts } = fakeRepo({
      'a.b.c': { ...doc('a.b.c', 'old'), $type: SCHEMA_COLLECTION },
    })
    const results = await publishLexicons(client, did, [doc('a.b.c', 'new')])
    expect(results).toEqual([{ nsid: 'a.b.c', status: 'updated' }])
    expect(puts).toHaveLength(1)
  })

  it('leaves records that match regardless of key order', async () => {
    const published = { $type: SCHEMA_COLLECTION, defs: doc('a.b.c').defs, id: 'a.b.c', lexicon: 1 }
    const { client, puts } = fakeRepo({ 'a.b.c': published })
    const results = await publishLexicons(client, did, [doc('a.b.c')])
    expect(results).toEqual([{ nsid: 'a.b.c', status: 'unchanged' }])
    expect(puts).toEqual([])
  })

  it('writes nothing on a dry run', async () => {
    const { client, puts } = fakeRepo()
    const results = await publishLexicons(client, did, [doc('a.b.c')], { dryRun: true })
    expect(results).toEqual([{ nsid: 'a.b.c', status: 'created' }])
    expect(puts).toEqual([])
  })

  it('stops on read errors other than a missing record', async () => {
    const { client, puts } = fakeRepo({}, new LexError('AuthRequired', 'no'))
    await expect(publishLexicons(client, did, [doc('a.b.c')])).rejects.toThrow('no')
    expect(puts).toEqual([])
  })
})
