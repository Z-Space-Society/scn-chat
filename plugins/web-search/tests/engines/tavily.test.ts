import { describe, expect, it } from 'vitest'
import { tavily } from '../../src/engines/tavily.ts'

describe('tavily', () => {
  it('posts the query and count, with the key as a bearer token', () => {
    const { url, init } = tavily.request({ query: 'tiles', count: 4, apiKey: 'tvly-key' })
    expect(url).toBe('https://api.tavily.com/search')
    expect(init?.headers).toMatchObject({ authorization: 'Bearer tvly-key' })
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'tiles',
      max_results: 4,
      search_depth: 'basic',
    })
  })

  it('maps results', () => {
    const body = JSON.stringify({
      query: 'tiles',
      results: [{ title: 'Tiles', url: 'https://example.com', content: 'About tiles', score: 0.9 }],
      response_time: 1.2,
    })
    expect(tavily.parse(body)).toEqual([
      { title: 'Tiles', url: 'https://example.com', snippet: 'About tiles' },
    ])
  })
})
