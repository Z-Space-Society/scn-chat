import type { SqlDb } from './sql.ts'

/** Private-use characters that mark where a match starts and ends in a snippet. */
export const MATCH_START = ''
export const MATCH_END = ''

export type SearchResult = {
  skey: string
  title: string | null
  /** Null when the conversation's title matched. */
  rkey: string | null
  role: string | null
  snippet: string
  /** When the message was created, or the conversation last updated for a title match. */
  time: string
}

/** Turn what the user typed into an FTS5 query of quoted words and phrases, ANDed. */
export function ftsQuery(input: string): string | null {
  const matches = [...input.matchAll(/"([^"]*)("?)|(\S+)/g)]
  const last = matches.at(-1)
  // Match the word still being typed as a prefix, unless a space or closing quote ends it.
  const typing = last && !last[2] && last.index + last[0].length === input.length ? last : null
  const terms = matches
    .map((match) => ({ match, text: (match[1] ?? match[3]) as string }))
    .filter(({ text }) => /[\p{L}\p{N}]/u.test(text))
    .map(({ match, text }) => `"${text.replaceAll('"', '""')}"${match === typing ? '*' : ''}`)
  return terms.length ? terms.join(' ') : null
}

const snippet = (table: string) =>
  `snippet(${table}, 0, '${MATCH_START}', '${MATCH_END}', '...', 30)`

/** Searches titles and message text. Priority is the title, then relevance and recency. */
export function search(
  db: SqlDb,
  query: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): SearchResult[] {
  const match = ftsQuery(query)
  if (!match) return []
  return db.all<SearchResult>(
    `select skey, title, rkey, role, snippet, time from (
       select 0 as kind, c.skey, c.title, null as rkey, null as role,
         ${snippet('conversation_fts')} as snippet, c.updated_at as time,
         bm25(conversation_fts) as rank
       from conversation_fts join conversation c on c.skey = conversation_fts.skey
       where conversation_fts match ?
       union all
       select 1, m.conversation_skey, c.title, m.rkey, m.role,
         ${snippet('message_fts')}, m.created_at, bm25(message_fts)
       from message_fts
       join message m on m.conversation_skey = message_fts.conversation_skey
         and m.author_did = message_fts.author_did and m.rkey = message_fts.rkey
       join conversation c on c.skey = m.conversation_skey
       where message_fts match ?
     )
     order by kind, rank, time desc
     limit ? offset ?`,
    [match, match, limit, offset],
  )
}
