import { describe, expect, it } from 'vitest'
import { brave } from '../../src/engines/brave.ts'

describe('brave', () => {
  it('sends the query and count, with the key in the subscription header', () => {
    const { url, init } = brave.request({ query: 'tiles', count: 3, apiKey: 'BSA-key' })
    expect(url).toBe('https://api.search.brave.com/res/v1/web/search?q=tiles&count=3')
    expect(init?.headers).toMatchObject({ 'x-subscription-token': 'BSA-key' })
  })

  it('maps web results', () => {
    const body = JSON.stringify({
      type: 'search',
      web: {
        type: 'search',
        results: [
          {
            title: 'Tiles',
            url: 'https://example.com',
            description: 'All about <strong>tiles</strong>',
          },
          { title: 'No description', url: 'https://example.org' },
        ],
      },
    })
    expect(brave.parse(body)).toEqual([
      { title: 'Tiles', url: 'https://example.com', snippet: 'All about <strong>tiles</strong>' },
      { title: 'No description', url: 'https://example.org', snippet: '' },
    ])
  })

  it('returns no results when the response has no web section', () => {
    expect(brave.parse(JSON.stringify({ type: 'search' }))).toEqual([])
  })
})
