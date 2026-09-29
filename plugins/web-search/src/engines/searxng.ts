import { z } from 'zod'
import type { SearchEngine } from './types.ts'

const response = z.object({
  results: z.array(
    z.object({ title: z.string(), url: z.string(), content: z.string().default('') }),
  ),
})

/** A SearXNG instance, which must have the json format enabled. */
export const searxng: SearchEngine = {
  id: 'searxng',
  name: 'SearXNG',
  needsKey: false,
  needsBaseURL: true,
  operators: ['site:example.com', '"exact phrase"'],
  request: ({ query, baseURL }) => {
    const base = baseURL?.endsWith('/') ? baseURL : `${baseURL}/`
    const url = new URL('search', base)
    url.search = new URLSearchParams({ q: query, format: 'json' }).toString()
    return { url: url.href }
  },
  parse: (body) =>
    response.parse(JSON.parse(body)).results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
    })),
  describeError: (status) =>
    status === 403
      ? 'The SearXNG instance refused to return JSON. Enable the json format in its settings.'
      : undefined,
}
