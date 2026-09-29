import { z } from 'zod'
import type { SearchEngine } from './types.ts'

const response = z.object({
  web: z
    .object({
      results: z.array(
        z.object({ title: z.string(), url: z.string(), description: z.string().default('') }),
      ),
    })
    .optional(),
})

export const brave: SearchEngine = {
  id: 'brave',
  name: 'Brave',
  needsKey: true,
  needsBaseURL: false,
  operators: ['site:example.com', '"exact phrase"', '-term', 'filetype:pdf'],
  request: ({ query, count, apiKey }) => ({
    url: `https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(count) })}`,
    init: { headers: { accept: 'application/json', 'x-subscription-token': apiKey ?? '' } },
  }),
  parse: (body) =>
    (response.parse(JSON.parse(body)).web?.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.description,
    })),
}
