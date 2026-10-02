import { describe, expect, it } from 'vitest'
import { duckduckgo } from '../../src/engines/duckduckgo.ts'
import { SearchError } from '../../src/engines/types.ts'

/** Trimmed from a real html.duckduckgo.com results page. */
const page = `<!DOCTYPE html><html><body><div id="links" class="results">
<div class="result results_links results_links_deep result--ad"><div class="links_main links_deep result__body">
<h2 class="result__title"><a rel="nofollow" class="result__a" href="https://duckduckgo.com/y.js?ad_domain=shop.example">Buy tiles</a></h2>
<a class="result__snippet" href="https://duckduckgo.com/y.js">Sponsored</a></div></div>
<div class="result results_links results_links_deep web-result"><div class="links_main links_deep result__body">
<h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftiling%3Fa%3D1&amp;rut=abc">How to <b>tile</b> a bathroom</a></h2>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftiling">Start from the <b>centre</b> &amp; work out.</a></div></div>
<div class="result results_links results_links_deep web-result"><div class="links_main links_deep result__body">
<h2 class="result__title"><a rel="nofollow" class="result__a" href="https://direct.example/page">Direct link</a></h2></div></div>
</div></body></html>`

describe('duckduckgo', () => {
  it('posts the query as a form to the HTML endpoint', () => {
    const { url, init } = duckduckgo.request({ query: 'tile a bathroom', count: 5 })
    expect(url).toBe('https://html.duckduckgo.com/html/')
    expect(init).toMatchObject({ method: 'POST', body: 'q=tile+a+bathroom' })
  })

  it('maps results, unwrapping redirect links and skipping ads', () => {
    expect(duckduckgo.parse(page)).toEqual([
      {
        title: 'How to tile a bathroom',
        url: 'https://example.com/tiling?a=1',
        snippet: 'Start from the <b>centre</b> &amp; work out.',
      },
      { title: 'Direct link', url: 'https://direct.example/page', snippet: '' },
    ])
  })

  it('returns no results for a results page without any', () => {
    expect(duckduckgo.parse('<html><body><div id="links"></div></body></html>')).toEqual([])
  })

  it('treats a page without the results container as a block, not an empty result', () => {
    expect(() =>
      duckduckgo.parse('<html><body><form id="challenge-form"></form></body></html>'),
    ).toThrow(SearchError)
  })
})
