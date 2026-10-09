import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageView } from '../../../../src/features/conversation/components/MessageView.tsx'
import { StreamingReply } from '../../../../src/features/conversation/components/StreamingReply.tsx'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const blobUrl = (cid: string) => `/blob/${cid}`

describe('MessageView', () => {
  it('keeps reasoning and tool details collapsed', () => {
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
              { $type: d('toolCallPart'), callId: 'c', tool: 'search', input: '{}' },
              { $type: d('toolResultPart'), callId: 'c', output: 'found' },
              { $type: d('sourcePart'), url: 'https://example.com', title: 'Example' },
            ],
          },
        }}
      />,
    )
    const details = Array.from(container.querySelectorAll('details'))
    expect(details.map((detail) => detail.querySelector('summary')?.textContent)).toEqual([
      'Reasoning',
      'Tool call: search',
      'Tool result',
    ])
    for (const detail of details) expect(detail.open).toBe(false)
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
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

  it('shows streamed text for a pending reply as Markdown', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        pending={<StreamingReply streaming={{ text: '*Hel*', reasoning: '' }} />}
        record={{
          role: 'assistant',
          status: 'pending',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByText('Hel').tagName).toBe('EM')
    expect(screen.queryByText('Thinking...')).toBeNull()
  })

  it('shows a pending reply with nothing in its place as thinking', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        record={{
          role: 'assistant',
          status: 'pending',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
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
    expect(screen.getByText('Stopped.')).toBeInTheDocument()
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
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
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
