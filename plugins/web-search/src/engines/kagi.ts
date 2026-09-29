import { z } from 'zod'
import type { SearchEngine } from './types.ts'

const response = z.object({
  data: z.array(
    z.union([
      z.object({
        t: z.literal(0),
        title: z.string(),
        url: z.string(),
        snippet: z.string().default(''),
      }),
      // Related searches and other non-result entries.
      z.object({ t: z.number() }),
    ]),
  ),
})

export const kagi: SearchEngine = {
  id: 'kagi',
  name: 'Kagi',
  needsKey: true,
  needsBaseURL: false,
  operators: ['site:example.com', '"exact phrase"', '-term', 'filetype:pdf'],
  request: ({ query, count, apiKey }) => ({
    url: `https://kagi.com/api/v0/search?${new URLSearchParams({ q: query, limit: String(count) })}`,
    init: { headers: { authorization: `Bot ${apiKey}` } },
  }),
  parse: (body) =>
    response
      .parse(JSON.parse(body))
      .data.flatMap((entry) =>
        'title' in entry ? [{ title: entry.title, url: entry.url, snippet: entry.snippet }] : [],
      ),
}
