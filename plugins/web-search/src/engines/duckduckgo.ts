import { parseHTML } from 'linkedom'
import { type SearchEngine, SearchError } from './types.ts'

const BLOCKED = 'DuckDuckGo blocked the search. Try again later, or pick another engine.'

/** The target of a DuckDuckGo redirect link, or the link itself. */
function unwrap(href: string): string {
  const url = new URL(href, 'https://duckduckgo.com')
  return url.pathname === '/l/' ? (url.searchParams.get('uddg') ?? href) : url.href
}

/** Scrapes DuckDuckGo's HTML results page, since it has no search API. */
export const duckduckgo: SearchEngine = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  needsKey: false,
  needsBaseURL: false,
  operators: ['site:example.com', '"exact phrase"', '-term', 'filetype:pdf'],
  request: ({ query }) => ({
    url: 'https://html.duckduckgo.com/html/',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: query }).toString(),
    },
  }),
  parse: (body) => {
    const { document } = parseHTML(body)
    if (!document.querySelector('#links')) throw new SearchError(BLOCKED)
    return [...document.querySelectorAll('.result:not(.result--ad)')].flatMap((result) => {
      const link = result.querySelector('a.result__a')
      const href = link?.getAttribute('href')
      if (!link || !href) return []
      return [
        {
          title: link.textContent ?? '',
          url: unwrap(href),
          snippet: result.querySelector('.result__snippet')?.innerHTML ?? '',
        },
      ]
    })
  },
  describeError: () => BLOCKED,
}
