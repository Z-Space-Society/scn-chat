import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  MarkdownSnippet,
  SearchResults,
  Snippet,
} from '../../../../src/features/chat-list/components/SearchResults.tsx'
import { shortTime } from '../../../../src/shared/time.ts'
import { MATCH_END, MATCH_START, type SearchResult } from '../../../../src/store/search.ts'
import { renderAt } from '../../../helpers/router.tsx'

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

describe('MarkdownSnippet', () => {
  it('styles Markdown inline and marks matches inside it', () => {
    const { container } = render(
      <MarkdownSnippet text={`a **bold ${MATCH_START}tile${MATCH_END}** and \`code\``} />,
    )
    expect(container.innerHTML).toBe(
      'a <strong>bold <mark>tile</mark></strong> and <code>code</code>',
    )
  })

  it('keeps blocks, links, and images to their inline text', () => {
    const { container } = render(
      <MarkdownSnippet
        text={'# Heading\n\n- an *item* with [a link](https://x.test) ![pic](https://x.test/p.png)'}
      />,
    )
    expect(container.querySelector('h1, ul, li, a, img')).toBeNull()
    expect(container.querySelector('em')).toHaveTextContent('item')
    expect(container).toHaveTextContent(/^Heading\s+an item with a link$/)
  })
  it('drops the markup the snippet cut left unpaired', () => {
    const shown = (text: string) => render(<MarkdownSnippet text={text} />).container.textContent
    expect(shown('…the **important')).toBe('…the important')
    expect(shown('part** of _it…')).toBe('part of it…')
    expect(shown('…run `npm i…')).toBe('…run npm i…')
    expect(shown('see [the docs](https://exa…')).toBe('see the docs…')
    expect(shown('…the docs](https://x.test) say')).toBe('…the docs say')
    expect(shown('[a](https://a.test) and [b](https://b.te…')).toBe('a and b…')
  })

  it('keeps delimiters between spaces, inside words, and in code', () => {
    const shown = (text: string) => render(<MarkdownSnippet text={text} />).container.textContent
    expect(shown('2 * 3 in snake_case and `**x`')).toBe('2 * 3 in snake_case and **x')
  })

  it('marks a match beside a cut delimiter', () => {
    const { container } = render(
      <MarkdownSnippet text={`...the **${MATCH_START}tile${MATCH_END}`} />,
    )
    expect(container.innerHTML).toBe('...the <mark>tile</mark>')
  })
})

describe('SearchResults', () => {
  it('links a message match to its message', async () => {
    await renderAt(
      <SearchResults query="blue" onClear={() => {}} results={[result({})]} remaining={0} />,
    )
    const [chat, message] = screen.getAllByRole('link')
    expect(chat).toHaveAttribute('href', '/chat/a')
    expect(message).toHaveAttribute('href', '/chat/a?m=u1')
  })

  it("groups a chat's matches under its title once, the title match first", async () => {
    await renderAt(
      <SearchResults
        query="blue"
        onClear={() => {}}
        results={[
          result({ rkey: null, role: null, snippet: 'Blue tiles' }),
          result({ skey: 'b', title: 'Grout', rkey: 'g1' }),
          result({ rkey: 'u2', snippet: 'more blue' }),
        ]}
        remaining={0}
      />,
    )
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/chat/a',
      '/chat/a?m=u2',
      '/chat/b',
      '/chat/b?m=g1',
    ])
  })

  it('links a title match to its conversation', async () => {
    await renderAt(
      <SearchResults
        query="blue"
        onClear={() => {}}
        results={[result({ rkey: null, role: null })]}
        remaining={0}
      />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/a')
  })

  it('shows the title, when, and whose words matched', async () => {
    const time = '2026-09-26T09:30:00Z'
    await renderAt(
      <SearchResults query="blue" onClear={() => {}} results={[result({ time })]} remaining={0} />,
    )
    const [chat, message] = screen.getAllByRole('link')
    expect(chat).toHaveTextContent(/^Tiles$/)
    expect(message).toHaveTextContent(/^You: blue tile.+$/)
    expect(screen.getByText(shortTime(new Date(time)))).toHaveAttribute('datetime', time)
  })

  it("styles a reply's Markdown but shows the user's words as written", async () => {
    await renderAt(
      <SearchResults
        query="bold"
        onClear={() => {}}
        results={[
          result({ rkey: 'a1', role: 'assistant', snippet: 'a **bold** tile' }),
          result({ rkey: 'u1', role: 'user', snippet: 'a **bold** tile' }),
        ]}
        remaining={0}
      />,
    )
    const [, reply, mine] = screen.getAllByRole('link')
    expect(reply?.querySelector('strong')).toHaveTextContent('bold')
    expect(mine).toHaveTextContent('You: a **bold** tile')
  })

  it('says how many chats are left to download', async () => {
    await renderAt(<SearchResults query="blue" onClear={() => {}} results={[]} remaining={3} />)
    expect(screen.getByRole('status')).toHaveTextContent('Still downloading 3 chats.')
  })

  it('shows skeletons until the first search answers, rather than saying nothing matched', async () => {
    await renderAt(
      <SearchResults loading query="blue" onClear={() => {}} results={[]} remaining={0} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Searching')
    expect(screen.queryByText(/No chats match/)).not.toBeInTheDocument()
  })

  it('names the search when nothing matched, with a button that clears it', async () => {
    const onClear = vi.fn()
    await renderAt(<SearchResults query=" blue " onClear={onClear} results={[]} remaining={0} />)
    expect(screen.getByText(/No chats match “blue”\./)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(onClear).toHaveBeenCalled()
  })
})
