import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageView } from '../../src/components/MessageView.tsx'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const blobUrl = (cid: string) => `/blob/${cid}`

describe('MessageView', () => {
  it('shows text as plain text and keeps reasoning and tool details collapsed', () => {
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
              { $type: d('textPart'), text: '**not markdown**' },
              { $type: d('sourcePart'), url: 'https://example.com', title: 'Example' },
            ],
          },
        }}
      />,
    )
    expect(screen.getByText('**not markdown**')).toBeInTheDocument()
    for (const details of container.querySelectorAll('details')) expect(details.open).toBe(false)
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('shows streamed text for a pending reply', () => {
    render(
      <MessageView
        blobUrl={blobUrl}
        streaming={{ text: 'Hel', reasoning: '' }}
        record={{
          role: 'assistant',
          status: 'pending',
          content: { $type: d('plainContent'), parts: [] },
        }}
      />,
    )
    expect(screen.getByText('Hel')).toBeInTheDocument()
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
        siblings={{ index: 1, count: 3, onPick }}
      />,
    )
    expect(screen.getByText(/2 \/ 3/)).toBeInTheDocument()
    screen.getByRole('button', { name: '›' }).click()
    expect(onPick).toHaveBeenCalledWith(2)
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
