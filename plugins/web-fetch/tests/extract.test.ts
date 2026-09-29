import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from '../src/extract.ts'

const paragraph =
  '<p>Lay the tiles in a grid, starting from the centre of the room so the cuts at the edges are even. <a href="/grout">Grout</a> after a day.</p>'

describe('htmlToMarkdown', () => {
  it('returns the title and the article as Markdown, without navigation or scripts', () => {
    const html = `<html><head><title>Tiling Guide</title></head><body><nav>Home | About</nav><article><h1>How to tile</h1>${paragraph.repeat(6)}</article><script>track()</script><footer>(c) 2026</footer></body></html>`
    const { title, markdown } = htmlToMarkdown(html, 'https://example.com/guide/')
    expect(title).toBe('Tiling Guide')
    expect(markdown).toContain('## How to tile')
    expect(markdown).not.toMatch(/Home \| About|track\(\)|\(c\) 2026/)
  })

  it('makes links absolute against the page URL', () => {
    const html = `<html><body><article>${paragraph.repeat(6)}</article></body></html>`
    const { markdown } = htmlToMarkdown(html, 'https://example.com/guide/tiles')
    expect(markdown).toContain('[Grout](https://example.com/grout)')
  })

  it('returns the text of a page with no article element, without its clutter', () => {
    const html =
      '<html><head><title>Status</title></head><body><nav>menu</nav><div>All systems normal</div><script>x()</script></body></html>'
    expect(htmlToMarkdown(html, 'https://example.com/')).toEqual({
      title: 'Status',
      markdown: 'All systems normal',
    })
  })
})
