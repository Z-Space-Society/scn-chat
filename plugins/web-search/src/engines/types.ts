export type SearchResult = { title: string; url: string; snippet: string }

export type SearchRequest = { query: string; count: number; apiKey?: string; baseURL?: string }

/** One search engine. Shared code sends the request, checks the status, and cleans up results. */
export type SearchEngine = {
  id: string
  name: string
  needsKey: boolean
  needsBaseURL: boolean
  /** Query operators the engine supports, listed in the tool description. */
  operators: string[]
  request(search: SearchRequest): { url: string; init?: RequestInit }
  /** Results from the response body. Throws when the body is not a results page. */
  parse(body: string): SearchResult[]
  /** A message for an error status, when the engine needs a better one than the default. */
  describeError?(status: number): string | undefined
}

export class SearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchError'
  }
}
