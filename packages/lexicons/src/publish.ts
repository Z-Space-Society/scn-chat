import { resolveTxt } from 'node:dns/promises'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Client, DidString, NsidString, TypedLexMap } from '@atproto/lex-client'
import { LexError } from '@atproto/lex-data'

export const SCHEMA_COLLECTION = 'com.atproto.lexicon.schema'

export type LexiconDoc = { lexicon: 1; id: NsidString } & Record<string, unknown>

export type PublishStatus = 'created' | 'updated' | 'unchanged'

type RecordClient = Pick<Client, 'getRecord' | 'putRecord'>

/** Load every lexicon document under the directory, except the vendored upstream ones. */
export async function loadLexicons(dir: string): Promise<LexiconDoc[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(e.parentPath, e.name))
    .filter((file) => !path.relative(dir, file).startsWith(`upstream${path.sep}`))
  const docs = await Promise.all(
    files.map(async (file) => {
      const doc = JSON.parse(await readFile(file, 'utf8')) as LexiconDoc
      if (doc.lexicon !== 1 || typeof doc.id !== 'string')
        throw new Error(`${file} is not a version 1 lexicon document`)
      return doc
    }),
  )
  return docs.sort((a, b) => (a.id < b.id ? -1 : 1))
}

/** The DNS name whose TXT record names the DID that publishes this NSID. */
export function lexiconDnsName(nsid: string): string {
  return `_lexicon.${nsid.split('.').slice(0, -1).reverse().join('.')}`
}

/** Describe each lexicon DNS record that is missing or points at a different DID. */
export async function checkDns(
  did: string,
  nsids: string[],
  resolve: (name: string) => Promise<string[][]> = resolveTxt,
): Promise<string[]> {
  const problems: string[] = []
  for (const name of new Set(nsids.map(lexiconDnsName))) {
    let dids: string[] = []
    try {
      dids = (await resolve(name))
        .map((chunks) => chunks.join(''))
        .filter((txt) => txt.startsWith('did='))
        .map((txt) => txt.slice(4))
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOTFOUND' && code !== 'ENODATA') throw err
    }
    if (dids.length === 0) problems.push(`${name} has no TXT record. Add: ${name} TXT "did=${did}"`)
    else if (!dids.includes(did))
      problems.push(`${name} points at ${dids.join(', ')}, not ${did}. Change it to "did=${did}"`)
  }
  return problems
}

/** Key-order-independent JSON, for comparing a local lexicon with its published record. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )

async function publishedRecord(client: RecordClient, did: DidString, nsid: NsidString) {
  try {
    const { body } = await client.getRecord(SCHEMA_COLLECTION, nsid, { repo: did })
    return body.value
  } catch (err) {
    if (err instanceof LexError && err.error === 'RecordNotFound') return null
    throw err
  }
}

/** Write each lexicon as a schema record in the DID's repo, skipping ones already up to date. */
export async function publishLexicons(
  client: RecordClient,
  did: DidString,
  docs: LexiconDoc[],
  { dryRun = false } = {},
): Promise<{ nsid: string; status: PublishStatus }[]> {
  const results: { nsid: string; status: PublishStatus }[] = []
  for (const doc of docs) {
    const record = { ...doc, $type: SCHEMA_COLLECTION } as TypedLexMap<NsidString>
    const existing = await publishedRecord(client, did, doc.id)
    if (existing && canonical(existing) === canonical(record)) {
      results.push({ nsid: doc.id, status: 'unchanged' })
      continue
    }
    if (!dryRun) await client.putRecord(record, doc.id, { repo: did })
    results.push({ nsid: doc.id, status: existing ? 'updated' : 'created' })
  }
  return results
}
