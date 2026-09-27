import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LexiconIterableIndexer,
  LexiconSchemaBuilder,
  lexiconDocumentSchema,
} from '@atproto/lex-document'
import { describe, expect, it } from 'vitest'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const lexiconDir = join(packageDir, '../../lexicons')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

const documents = filesUnder(lexiconDir)
  .filter((path) => path.endsWith('.json'))
  .map((path) => ({ path, doc: JSON.parse(readFileSync(path, 'utf8')) }))

describe('lexicon documents', () => {
  it.each(documents.map(({ path, doc }) => [relative(lexiconDir, path), doc]))(
    '%s validates against the lexicon schema',
    (_path, doc) => {
      expect(lexiconDocumentSchema.safeParse(doc).success).toBe(true)
    },
  )

  it('resolve every cross-document reference', async () => {
    const schemas = await LexiconSchemaBuilder.buildAll(
      new LexiconIterableIndexer(documents.map(({ doc }) => doc)),
    )
    expect(schemas.size).toBeGreaterThan(0)
  })
})

describe('generated code', () => {
  it('matches a fresh codegen run', () => {
    const out = mkdtempSync(join(tmpdir(), 'scn-lex-'))
    try {
      execFileSync(
        'pnpm',
        [
          'exec',
          'lex',
          'build',
          '--lexicons',
          lexiconDir,
          '--out',
          out,
          '--clear',
          '--index-file',
          '--import-ext',
          '.ts',
          '--lib',
          '@atproto/lex-schema',
        ],
        { cwd: packageDir, stdio: 'pipe' },
      )
      const generatedDir = join(packageDir, 'src/generated')
      const fresh = filesUnder(out)
        .map((path) => relative(out, path))
        .sort()
      const committed = filesUnder(generatedDir)
        .map((path) => relative(generatedDir, path))
        .sort()
      expect(committed).toEqual(fresh)
      for (const file of fresh) {
        expect(readFileSync(join(generatedDir, file), 'utf8'), file).toBe(
          readFileSync(join(out, file), 'utf8'),
        )
      }
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  }, 60_000)
})
