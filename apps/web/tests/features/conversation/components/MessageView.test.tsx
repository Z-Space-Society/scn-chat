import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageView } from '../../../../src/features/conversation/components/MessageView.tsx'
import { StreamingReply } from '../../../../src/features/conversation/components/StreamingReply.tsx'
import { noParts } from '../../../../src/features/conversation/lib/reply-stream.ts'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const blobUrl = (cid: string) => `/blob/${cid}`

const working = {
  role: 'assistant',
  status: 'complete',
  content: {
    $type: d('plainContent'),
    parts: [
      { $type: d('reasoningPart'), text: 'Look it up first' },
      { $type: d('toolCallPart'), callId: 'c', tool: 'lookup', input: '{"query":"tiles"}' },
      { $type: d('toolResultPart'), callId: 'c', output: '{"hits":2}' },
      { $type: d('textPart'), text: 'Found it' },
    ],
  },
}

describe('MessageView', () => {
  it('keeps the steps of a finished reply behind a footer button that opens them under it', async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    expect(container.querySelector('[data-steps]')).toBeNull()
    const button = screen.getByRole('button', { name: 'Thought · lookup' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const steps = container.querySelector('[data-steps=work]') as HTMLElement
    expect(button).toHaveAttribute('aria-controls', steps.id)
    expect(container.querySelector('footer')?.compareDocumentPosition(steps)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    const items = Array.from(steps.querySelectorAll<HTMLElement>(':scope > ol > li > [data-step]'))
    expect(items.map((item) => item.dataset.step)).toEqual(['reasoning', 'tool'])
    await userEvent.click(button)
    expect(container.querySelector('[data-steps]')).toBeNull()
  })

  it('shows a thought as a row with a glimpse of its first line, which opens onto all of it', async () => {
    const record = {
      ...working,
      content: {
        $type: d('plainContent'),
        parts: [
          { $type: d('reasoningPart'), text: '\n## **Planning** the `search`\n\nThen look closer' },
          ...working.content.parts.slice(1),
        ],
      },
    }
    const { container } = render(<MessageView blobUrl={blobUrl} record={record} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · lookup' }))
    const thought = container.querySelector('[data-step=reasoning]') as HTMLDetailsElement
    const row = thought.querySelector('summary') as HTMLElement
    expect(row.textContent).toMatch(/^Thought\s*Planning the search\s*$/)
    expect(thought.open).toBe(false)
    await userEvent.click(row)
    expect(thought.open).toBe(true)
    expect(thought.querySelector('h2')).toHaveTextContent('Planning the search')
    expect(thought).toHaveTextContent('Then look closer')
    expect(within(thought).queryByRole('button')).toBeNull()
  })

  it("renders a step's body only once it has been opened, and keeps it once closed", async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · lookup' }))
    const thought = container.querySelector('[data-step=reasoning]') as HTMLDetailsElement
    const tool = container.querySelector('[data-step=tool]') as HTMLDetailsElement
    expect(thought.children).toHaveLength(1)
    expect(tool.querySelector('pre')).toBeNull()
    const row = tool.querySelector('summary') as HTMLElement
    await userEvent.click(row)
    expect(tool.open).toBe(true)
    expect(tool.querySelectorAll('pre')).toHaveLength(2)
    await userEvent.click(row)
    expect(tool.open).toBe(false)
    expect(tool.querySelectorAll('pre')).toHaveLength(2)
  })

  it('pairs a tool call with its result, showing the input at a glance and both in full', async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · lookup' }))
    const tool = container.querySelector('[data-step=tool]') as HTMLDetailsElement
    expect(tool.querySelector('summary')).toHaveTextContent('lookup "tiles"')
    expect(tool.dataset.state).toBe('done')
    await openToolSteps(container)
    const shown = Array.from(tool.querySelectorAll('pre')).map((pre) => pre.textContent)
    expect(shown).toEqual(['{\n  "query": "tiles"\n}', '{\n  "hits": 2\n}'])
  })

  it('names the model that wrote a reply', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{ ...working, model: { provider: 'anthropic', id: 'claude-sonnet-5-5' } }}
      />,
    )
    expect(screen.getByText('claude-sonnet-5-5')).toBeInTheDocument()
  })

  it('holds its actions together in one named bar', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={working}
        actions={
          <button type="button" aria-label="Copy">
            C
          </button>
        }
      />,
    )
    const bar = screen.getByRole('group', { name: 'Message actions' })
    expect(within(bar).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('keeps a lone reasoning step behind the footer and sources apart from the text', () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [
              { $type: d('reasoningPart'), text: 'thinking' },
              { $type: d('sourcePart'), url: 'https://example.com', title: 'Example' },
            ],
          },
        }}
      />,
    )
    expect(container.querySelector('details:not([data-sources])')).toBeNull()
    expect(screen.getByRole('button', { name: 'Thought' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('names a source without a title by its site', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [{ $type: d('sourcePart'), url: 'https://www.example.com/a/long/path?q=1' }],
          },
        }}
      />,
    )
    const link = screen.getByRole('link', { name: 'example.com' })
    expect(link).toHaveAttribute('title', 'https://www.example.com/a/long/path?q=1')
  })

  it('counts its sources and names the site of each one with a title', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [
              { $type: d('sourcePart'), url: 'https://www.example.com/a', title: 'Example' },
              { $type: d('sourcePart'), url: 'https://other.org/b' },
            ],
          },
        }}
      />,
    )
    const sources = screen.getByRole('region', { name: 'Sources' })
    expect(sources).toHaveTextContent('2 sources')
    expect(
      within(sources)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Exampleexample.com', 'other.org'])
  })

  it('keeps its sources behind their count until it is opened', async () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: Array.from({ length: 10 }, (_, i) => ({
              $type: d('sourcePart'),
              url: `https://site${i + 1}.test/`,
              title: `Source ${i + 1}`,
            })),
          },
        }}
      />,
    )
    const sources = screen.getByRole('region', { name: 'Sources' })
    const details = sources.querySelector('details')
    expect(details).not.toHaveAttribute('open')
    await userEvent.click(within(sources).getByText('10 sources'))
    expect(details).toHaveAttribute('open')
    expect(within(sources).getAllByRole('listitem')).toHaveLength(10)
    expect(within(sources).queryByRole('button')).toBeNull()
  })

  it("copies a code block's code", async () => {
    const user = userEvent.setup()
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [{ $type: d('textPart'), text: 'Run:\n\n```sh\npnpm dev\npnpm check\n```' }],
          },
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await navigator.clipboard.readText()).toBe('pnpm dev\npnpm check')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('renders assistant text as Markdown', () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [
              {
                $type: d('textPart'),
                text: '**bold** and [docs](https://example.com)\n\n| a |\n|---|\n| 1 |',
              },
            ],
          },
        }}
      />,
    )
    expect(container.querySelector('.markdown strong')).toHaveTextContent('bold')
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('does not render raw HTML or script links in assistant text', () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [
              {
                $type: d('textPart'),
                text: '<img src=x onerror="alert(1)"> [click](javascript:alert(1))',
              },
            ],
          },
        }}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a[href^="javascript"]')).toBeNull()
  })

  it('shows the full URL of a Markdown image in assistant text and loads it only on click', async () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'complete',
          content: {
            $type: d('plainContent'),
            parts: [{ $type: d('textPart'), text: '![chart](https://example.com/c.png?q=secret)' }],
          },
        }}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('https://example.com/c.png?q=secret')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load image' }))
    expect(screen.getByAltText('chart')).toHaveAttribute(
      'src',
      'https://example.com/c.png?q=secret',
    )
  })

  it('shows user text as plain text', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'user',
          content: { $type: d('plainContent'), parts: [{ $type: d('textPart'), text: '**raw**' }] },
        }}
      />,
    )
    expect(screen.getByText('**raw**')).toBeInTheDocument()
  })

  it('shows quoted lines in user text as a quote, in the same bubble as the text', () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'user',
          content: {
            $type: d('plainContent'),
            parts: [{ $type: d('textPart'), text: '> quoted **bit**\n\nAbout this:' }],
          },
        }}
      />,
    )
    const quote = container.querySelector('article blockquote')
    expect(quote).toHaveTextContent(/^quoted \*\*bit\*\*$/)
    // The quote and the words after it share one bubble.
    expect(quote?.parentElement?.querySelector('p')).toHaveTextContent('About this:')
  })

  it('shows streamed text for a pending reply as Markdown', () => {
    const reply = { ...noParts, parts: [{ $type: d('textPart'), text: '*Hel*' }] }
    render(
      <MessageView
        blobUrl={blobUrl}
        pending={<StreamingReply reply={reply} blobUrl={blobUrl} />}
        record={{
          role: 'assistant',
          status: 'pending',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByText('Hel').tagName).toBe('EM')
    expect(screen.queryByText(/Waiting for/)).toBeNull()
  })

  it('says what a streaming reply is doing right now', () => {
    const call = { $type: d('toolCallPart'), callId: 'c', tool: 'fetch', input: '"https://x.test"' }
    const { container, rerender } = render(
      <StreamingReply reply={{ ...noParts, parts: [call] }} blobUrl={blobUrl} />,
    )
    expect(container.querySelector('[data-steps] summary')).toHaveTextContent('Running fetch…')
    expect(container.querySelector('[data-step=tool]')).toHaveAttribute('data-state', 'running')
    // Once the reply starts, the work gives way to it.
    const text = { $type: d('textPart'), text: 'Here' }
    rerender(<StreamingReply reply={{ ...noParts, parts: [call, text] }} blobUrl={blobUrl} />)
    expect(container.querySelector('[data-step=tool]')).not.toBeVisible()
    expect(screen.getByText('Here')).toBeVisible()
    rerender(<StreamingReply reply={{ ...noParts, queued: true }} blobUrl={blobUrl} />)
    expect(screen.getByText(/In line/)).toBeInTheDocument()
    // Before anything arrives, the reply's header says it is waiting.
    rerender(<StreamingReply reply={noParts} blobUrl={blobUrl} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a pending reply as its model waiting in the header', () => {
    const { container } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'pending',
          model: { provider: 'anthropic', id: 'claude-sonnet-5-5' },
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    const header = container.querySelector('header') as HTMLElement
    expect(header).toHaveTextContent(/^claude-sonnet-5-5$/)
    expect(within(header).getByText('claude-sonnet-5-5')).toBeInTheDocument()
  })

  it('shows an error and a stopped label', () => {
    const { rerender } = render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'error',
          error: 'rate limited',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('rate limited')
    rerender(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'cancelled',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('shows images inline and files by name', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'user',
          content: {
            $type: d('plainContent'),
            parts: [
              {
                $type: d('imagePart'),
                image: { ref: { $link: 'img1' }, mimeType: 'image/png' },
                alt: 'a cat',
              },
              { $type: d('filePart'), file: { ref: { $link: 'pdf1' } }, name: 'report.pdf' },
            ],
          },
        }}
      />,
    )
    expect(screen.getByAltText('a cat')).toHaveAttribute('src', '/blob/img1')
    expect(screen.getByRole('link', { name: 'report.pdf' })).toHaveAttribute('href', '/blob/pdf1')
  })

  it('switches between siblings', () => {
    const onPick = vi.fn()
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{ role: 'assistant', content: { $type: d('plainContent'), parts: [] } }}
        siblings={{ index: 1, count: 3, previous: 'a', next: 'c', onPick }}
      />,
    )
    expect(screen.getByText('2/3')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Next version' }).click()
    expect(onPick).toHaveBeenCalledWith('c')
  })

  it('says a message is encrypted', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{ role: 'user', content: { $type: d('encryptedContent') } }}
      />,
    )
    expect(screen.getByText('This message is encrypted.')).toBeInTheDocument()
  })
})

const call = (callId: string, tool: string, input: unknown) => ({
  $type: d('toolCallPart'),
  callId,
  tool,
  input: JSON.stringify(input),
})
const result = (callId: string, output: unknown, more: Record<string, unknown> = {}) => ({
  $type: d('toolResultPart'),
  callId,
  output: typeof output === 'string' ? output : JSON.stringify(output),
  ...more,
})
/** A finished reply that made these tool parts, with its steps opened from the footer. */
async function openSteps(parts: object[], status = 'complete') {
  const record = {
    role: 'assistant',
    status,
    content: {
      $type: d('plainContent'),
      parts: [...parts, { $type: d('textPart'), text: 'Done' }],
    },
  }
  const view = render(<MessageView blobUrl={blobUrl} record={record} />)
  const footer = view.container.querySelector('footer') as HTMLElement
  await userEvent.click(within(footer).getByRole('button'))
  await openToolSteps(view.container)
  return view
}
const toolSteps = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLDetailsElement>('[data-step=tool]'))

/** Open each tool step, whose view renders only once it has been opened. */
async function openToolSteps(container: HTMLElement) {
  for (const step of toolSteps(container))
    await userEvent.click(step.querySelector('summary') as HTMLElement)
}

describe('tool views', () => {
  it('shows every call still waiting for its result in a streaming reply as running', () => {
    const parts = [call('a', 'lookup', { q: 'one' }), call('b', 'lookup', { q: 'two' })]
    const { container } = render(<StreamingReply reply={{ ...noParts, parts }} blobUrl={blobUrl} />)
    expect(toolSteps(container).map((step) => step.dataset.state)).toEqual(['running', 'running'])
    expect(toolSteps(container).map((step) => step.querySelector('summary')?.textContent)).toEqual([
      expect.stringContaining('running'),
      expect.stringContaining('running'),
    ])
  })

  it('says a call cut off without its result is incomplete, and a failed one failed', async () => {
    const { container } = await openSteps(
      [
        call('a', 'lookup', { q: 'one' }),
        call('b', 'lookup', { q: 'two' }),
        result('b', 'Rate limited', { isError: true }),
        call('c', 'lookup', { q: 'three' }),
        result('c', 'fine'),
      ],
      'cancelled',
    )
    const steps = toolSteps(container)
    expect(steps.map((step) => step.dataset.state)).toEqual(['incomplete', 'error', 'done'])
    expect(steps[0]?.querySelector('summary')).toHaveTextContent('incomplete')
    expect(steps[1]?.querySelector('summary')).toHaveTextContent('failed')
    expect(steps[2]?.querySelector('summary')).not.toHaveTextContent(/running|failed|incomplete/)
  })

  it('names a web search by what it did, on the live line, its row, and the summary', async () => {
    const search = call('a', 'web_search', { query: 'espresso grinders' })
    const live = render(
      <StreamingReply reply={{ ...noParts, parts: [search] }} blobUrl={blobUrl} />,
    )
    expect(live.container.querySelector('[data-steps] summary')).toHaveTextContent(
      'Searching the web…',
    )
    live.unmount()
    const { container } = await openSteps([
      search,
      result('a', { results: [] }),
      call('b', 'web_search', { query: 'burr sizes' }),
      result('b', { results: [] }),
      call('c', 'lookup', { q: 'x' }),
      result('c', 'ok'),
    ])
    expect(
      within(container.querySelector('footer') as HTMLElement).getByRole('button'),
    ).toHaveTextContent('Searched the web ×2 · lookup')
    const rows = toolSteps(container).map((step) => step.querySelector('summary')?.textContent)
    expect(rows[0]).toMatch(/^Searched the web\s*espresso grinders\s*$/)
    expect(rows[2]).toMatch(/^lookup\s*"x"\s*$/)
  })

  it("lists a web search's results as links to their pages, each with its site and snippet", async () => {
    const { container } = await openSteps([
      call('a', 'web_search', { query: 'grinders' }),
      result('a', {
        results: [
          {
            title: 'Grinder review',
            url: 'https://www.example.test/review',
            snippet: 'A <b>burr</b> grinder ![x](https://t.test/x.png)',
          },
          { title: 'Odd link', url: 'javascript:alert(1)', snippet: 'Never a link' },
        ],
      }),
    ])
    const step = toolSteps(container)[0] as HTMLElement
    const link = within(step).getByRole('link', { name: 'Grinder review' })
    expect(link).toHaveAttribute('href', 'https://www.example.test/review')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    const items = within(step).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('example.test')
    expect(items[0]).toHaveTextContent('A <b>burr</b> grinder ![x](https://t.test/x.png)')
    expect(step.querySelector('b, img')).toBeNull()
    expect(items[1]).toHaveTextContent('Odd link')
    expect(within(items[1] as HTMLElement).queryByRole('link')).toBeNull()
    expect(step.querySelector('pre')).toBeNull()
  })

  it("folds a web search's results after the first seven behind Show more", async () => {
    const results = (count: number) => ({
      results: Array.from({ length: count }, (_, i) => ({
        title: `Result ${i + 1}`,
        url: `https://site${i + 1}.test/`,
      })),
    })
    const { container } = await openSteps([
      call('a', 'web_search', { query: 'eight' }),
      result('a', results(8)),
      call('b', 'web_search', { query: 'ten' }),
      result('b', results(10)),
    ])
    const [eight, ten] = toolSteps(container) as HTMLElement[]
    expect(within(eight as HTMLElement).getAllByRole('listitem')).toHaveLength(8)
    expect(within(eight as HTMLElement).queryByRole('button')).toBeNull()
    const step = ten as HTMLElement
    expect(within(step).getAllByRole('listitem')).toHaveLength(7)
    await userEvent.click(within(step).getByRole('button', { name: 'Show 3 more' }))
    expect(within(step).getAllByRole('listitem')).toHaveLength(10)
    expect(within(step).getByRole('link', { name: 'Result 8' })).toHaveFocus()
    await userEvent.click(within(step).getByRole('button', { name: 'Show less' }))
    expect(within(step).getAllByRole('listitem')).toHaveLength(7)
  })

  it('says a web search is searching while it runs, and when it found nothing', async () => {
    const search = call('a', 'web_search', { query: 'grinders' })
    const live = render(
      <StreamingReply reply={{ ...noParts, parts: [search] }} blobUrl={blobUrl} />,
    )
    await openToolSteps(live.container)
    expect(toolSteps(live.container)[0]).toHaveTextContent('Searching…')
    live.unmount()
    const { container } = await openSteps([search, result('a', { results: [] })])
    expect(toolSteps(container)[0]).toHaveTextContent('No results.')
  })

  it("shows a web search it can't read as its input and output", async () => {
    const blob = { $type: 'blob', ref: { $link: 'big' }, mimeType: 'text/plain', size: 9 }
    const { container } = await openSteps([
      call('a', 'web_search', { query: 'failed' }),
      result('a', 'Search engine timed out', { isError: true }),
      call('b', 'web_search', { query: 'kept in a blob' }),
      result('b', 'Output stored as a blob (9 bytes).', { outputBlob: blob }),
      call('c', 'web_search', { query: 'older shape' }),
      result('c', { hits: 2 }),
    ])
    const [failed, inBlob, older] = toolSteps(container) as HTMLElement[]
    expect(failed).toHaveTextContent('Search engine timed out')
    expect(
      within(inBlob as HTMLElement).getByRole('link', { name: 'Full output' }),
    ).toHaveAttribute('href', '/blob/big')
    expect(
      Array.from((older as HTMLElement).querySelectorAll('pre')).map((pre) => pre.textContent),
    ).toEqual(['{\n  "query": "older shape"\n}', '{\n  "hits": 2\n}'])
  })

  it('shows a page fetch as the page it read, with the part of its text it read', async () => {
    const { container } = await openSteps([
      call('a', 'web_fetch', { url: 'https://www.example.test/guide?x=1', offset: 20000 }),
      result('a', {
        url: 'https://example.test/guide/',
        title: 'The <i>guide</i>',
        content: '# Heading\n\nSome **text**',
        offset: 20000,
        nextOffset: 40000,
        totalCharacters: 48213,
      }),
      call('b', 'web_fetch', { url: 'https://short.test/' }),
      result('b', {
        url: 'https://short.test/',
        content: 'All of it',
        offset: 0,
        totalCharacters: 9,
      }),
      call('c', 'web_fetch', { url: 'https://down.test/' }),
      result('c', 'Fetch failed with 503', { isError: true }),
    ])
    const [long, short, failed] = toolSteps(container) as HTMLElement[]
    expect(long?.querySelector('summary')?.textContent).toMatch(
      /^Read a page\s*example\.test\/guide\?x=1\s*$/,
    )
    const link = within(long as HTMLElement).getByRole('link', { name: 'The <i>guide</i>' })
    expect(link).toHaveAttribute('href', 'https://example.test/guide/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    expect(long).toHaveTextContent('Characters 20,001–40,000 of 48,213')
    expect(long?.querySelector('pre')?.textContent).toBe('# Heading\n\nSome **text**')
    expect(long?.querySelector('i, h1, strong, img')).toBeNull()
    const body = long?.querySelector(':scope > summary ~ *') as HTMLElement
    expect(within(body).getByText('example.test')).toBeInTheDocument()
    expect(
      within(short as HTMLElement).getByRole('link', { name: 'short.test' }),
    ).toBeInTheDocument()
    expect(short).not.toHaveTextContent('Characters')
    expect(failed).toHaveTextContent('Fetch failed with 503')
    expect(container.querySelector('footer')).toHaveTextContent('Read a page ×3')
  })

  it('shows a result whose call it never saw alone, as its output', async () => {
    const { container } = await openSteps([result('lost', { results: [] })])
    const [step] = toolSteps(container)
    expect(step?.dataset.state).toBe('done')
    expect(step?.querySelector('pre')?.textContent).toBe('{\n  "results": []\n}')
  })

  it('says a fetch of the last part of a page read to its end', async () => {
    const { container } = await openSteps([
      call('a', 'web_fetch', { url: 'https://x.test/', offset: 40000 }),
      result('a', {
        url: 'https://x.test/',
        content: 'The end',
        offset: 40000,
        totalCharacters: 48213,
      }),
    ])
    expect(toolSteps(container)[0]).toHaveTextContent('Characters 40,001–48,213 of 48,213')
  })

  it("shows a page fetch it can't read as its input and output", async () => {
    const blob = { $type: 'blob', ref: { $link: 'big' }, mimeType: 'text/plain', size: 9 }
    const { container } = await openSteps([
      call('a', 'web_fetch', { url: 'https://x.test/' }),
      result('a', 'Output stored as a blob (9 bytes).', { outputBlob: blob }),
      call('b', 'web_fetch', { url: 'https://y.test/' }),
      result('b', { page: 'older shape' }),
    ])
    const [inBlob, older] = toolSteps(container) as HTMLElement[]
    expect(
      within(inBlob as HTMLElement).getByRole('link', { name: 'Full output' }),
    ).toBeInTheDocument()
    expect(
      Array.from((older as HTMLElement).querySelectorAll('pre')).map((pre) => pre.textContent),
    ).toEqual(['{\n  "url": "https://y.test/"\n}', '{\n  "page": "older shape"\n}'])
  })
})
