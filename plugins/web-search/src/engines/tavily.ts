import { z } from 'zod'
import type { SearchEngine } from './types.ts'

const response = z.object({
  results: z.array(
    z.object({ title: z.string(), url: z.string(), content: z.string().default('') }),
  ),
})

export const tavily: SearchEngine = {
  id: 'tavily',
  name: 'Tavily',
  needsKey: true,
  needsBaseURL: false,
  operators: [],
  request: ({ query, count, apiKey }) => ({
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: count, search_depth: 'basic' }),
    },
  }),
  parse: (body) =>
    response.parse(JSON.parse(body)).results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
    })),
}
