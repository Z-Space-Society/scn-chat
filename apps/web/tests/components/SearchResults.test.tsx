import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SearchResults, Snippet } from '../../src/components/SearchResults.tsx'
import { MATCH_END, MATCH_START, type SearchResult } from '../../src/store/search.ts'
import { renderAt } from '../helpers/router.tsx'

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
  it('links a message match to its message', async () => {
    await renderAt(<SearchResults results={[result({})]} remaining={0} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/a?m=u1')
  })

  it('links a title match to its conversation', async () => {
    await renderAt(<SearchResults results={[result({ rkey: null, role: null })]} remaining={0} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/a')
  })

  it('says how many conversations are left to download', async () => {
    await renderAt(<SearchResults results={[]} remaining={3} />)
    expect(screen.getByRole('status')).toHaveTextContent('Still downloading 3 conversations.')
  })

  it('says when nothing matched', async () => {
    await renderAt(<SearchResults results={[]} remaining={0} />)
    expect(screen.getByText('No matches.')).toBeInTheDocument()
  })
})
