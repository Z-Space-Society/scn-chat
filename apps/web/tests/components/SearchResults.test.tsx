import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchResults, Snippet } from '../../src/components/SearchResults.tsx'
import { MATCH_END, MATCH_START, type SearchResult } from '../../src/store/search.ts'

const result = (overrides: Partial<SearchResult>): SearchResult => ({
  skey: 'a',
  title: 'Tiles',
  rkey: 'u1',
  role: 'user',
  snippet: 'blue tile',
  time: '2026-09-26T00:00:00Z',
  ...overrides,
})

describe('Snippet', () => {
  it('turns marked matches into highlight elements', () => {
    const { container } = render(<Snippet text={`blue ${MATCH_START}tile${MATCH_END} grout`} />)
    expect(container.innerHTML).toBe('blue <mark>tile</mark> grout')
  })

  it('shows markup in the text as plain text', () => {
    const { container } = render(<Snippet text={`<b>${MATCH_START}x${MATCH_END}</b>`} />)
    expect(container.querySelector('b')).toBeNull()
    expect(container).toHaveTextContent('<b>x</b>')
  })
})

describe('SearchResults', () => {
  it('links a message match to its message and a title match to its conversation', () => {
    render(
      <SearchResults
        results={[result({}), result({ skey: 'b', rkey: null, role: null })]}
        remaining={0}
      />,
    )
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/c/a?m=u1',
      '/c/b',
    ])
  })
})
