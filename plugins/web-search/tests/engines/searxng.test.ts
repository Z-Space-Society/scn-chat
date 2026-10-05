import { describe, expect, it } from 'vitest'
import { searxng } from '../../src/engines/searxng.ts'

describe('searxng', () => {
  it('asks the instance for JSON, keeping any path in the base URL', () => {
    expect(
      searxng.request({ query: 'tiles', count: 5, baseURL: 'https://example.org/searx' }).url,
    ).toBe('https://example.org/searx/search?q=tiles&format=json')
  })

  it('maps results', () => {
    const body = JSON.stringify({
      query: 'tiles',
      results: [
        { title: 'Tiles', url: 'https://example.com', content: 'About tiles', engine: 'bing' },
        { title: 'Bare', url: 'https://example.org' },
      ],
    })
    expect(searxng.parse(body)).toEqual([
      { title: 'Tiles', url: 'https://example.com', snippet: 'About tiles' },
      { title: 'Bare', url: 'https://example.org', snippet: '' },
    ])
  })
})
