import { describe, expect, it } from 'vitest'
import { kagi } from '../../src/engines/kagi.ts'

describe('kagi', () => {
  it('sends the query and limit, with the key as a bot token', () => {
    const { url, init } = kagi.request({ query: 'tiles', count: 5, apiKey: 'kagi-key' })
    expect(url).toBe('https://kagi.com/api/v0/search?q=tiles&limit=5')
    expect(init?.headers).toMatchObject({ authorization: 'Bot kagi-key' })
  })

  it('maps search results and skips related searches', () => {
    const body = JSON.stringify({
      meta: { id: 'x', node: 'us-east', ms: 100 },
      data: [
        { t: 0, rank: 1, url: 'https://example.com', title: 'Tiles', snippet: 'About tiles' },
        { t: 1, list: ['tile grout', 'tile spacing'] },
        { t: 0, rank: 2, url: 'https://example.org', title: 'More' },
      ],
    })
    expect(kagi.parse(body)).toEqual([
      { title: 'Tiles', url: 'https://example.com', snippet: 'About tiles' },
      { title: 'More', url: 'https://example.org', snippet: '' },
    ])
  })
})
