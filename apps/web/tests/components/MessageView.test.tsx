import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MessageView } from '../../src/components/MessageView.tsx'

const d = (name: string) => `network.sharedcomputer.chat.defs#${name}`
const blobUrl = (cid: string) => `/blob/${cid}`

describe('MessageView', () => {
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
})
