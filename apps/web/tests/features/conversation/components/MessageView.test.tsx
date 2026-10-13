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
      { $type: d('toolCallPart'), callId: 'c', tool: 'web_search', input: '{"query":"tiles"}' },
      { $type: d('toolResultPart'), callId: 'c', output: '{"hits":2}' },
      { $type: d('textPart'), text: 'Found it' },
    ],
  },
}

describe('MessageView', () => {
  it('keeps the steps of a finished reply behind a footer button that opens them under it', async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    expect(container.querySelector('[data-steps]')).toBeNull()
    const button = screen.getByRole('button', { name: 'Thought · web_search' })
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

  it('shows a thought that fits in three lines with nothing to open', async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · web_search' }))
    const thought = container.querySelector('[data-step=reasoning]') as HTMLElement
    expect(thought).toHaveTextContent('Look it up first')
    expect(thought.querySelector('button')).toBeNull()
  })

  it('opens a long thought from Show more or anywhere on it, and closes it from Show less', async () => {
    // jsdom lays nothing out, so the thought's text stands taller than the three lines it shows.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      height: 200,
    } as DOMRect)
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · web_search' }))
    const text = container.querySelector('[data-step=reasoning] [data-thought] p') as HTMLElement
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const toggle = screen.getByRole('button', { name: 'Show less' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Open, a click on the text leaves it open, so the text can be read and selected.
    await userEvent.click(text)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(toggle).toHaveTextContent('Show more')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(text)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    vi.restoreAllMocks()
  })

  it('pairs a tool call with its result, showing the input at a glance and both in full', async () => {
    const { container } = render(<MessageView blobUrl={blobUrl} record={working} />)
    await userEvent.click(screen.getByRole('button', { name: 'Thought · web_search' }))
    const tool = container.querySelector('[data-step=tool]') as HTMLDetailsElement
    expect(tool.querySelector('summary')).toHaveTextContent('web_search "tiles"')
    expect(tool.dataset.state).toBe('done')
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
    expect(container.querySelector('details')).toBeNull()
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
    expect(screen.getByText('Stopped before it finished.')).toBeInTheDocument()
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
        siblings={{
          messages: ['a', 'b', 'c'].map((rkey) => ({ rkey, record: {} })),
          index: 1,
          onPick,
        }}
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
