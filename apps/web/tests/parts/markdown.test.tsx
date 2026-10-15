import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown } from '../../src/parts/markdown.tsx'

/** Catch what a download saves: its file name and its text. */
function catchDownload() {
  const saved: { filename: string; blob: Blob | null } = { filename: '', blob: null }
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    saved.blob = blob as Blob
    return 'blob:download'
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.filename = this.download
  })
  return saved
}

const table = '| Room | Cost |\n|---|---|\n| Bath, upstairs | 380 |'

describe('Markdown', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('colors code by the theme, a token at a time, once its language loads', async () => {
    const { container } = render(<Markdown text={'```ts\nconst a = 1\n```'} />)
    await waitFor(() =>
      expect(container.querySelector('.code-block .line > span')).toHaveStyle({
        color: 'var(--color-code-token-keyword)',
      }),
    )
    expect(container.querySelector('.code-block')).toHaveTextContent('const a = 1')
  })

  it('colors finished code from its first render once the same code has been highlighted', async () => {
    const first = render(<Markdown text={'```ts\nconst a = 1\n```'} />)
    await waitFor(() =>
      expect(first.container.querySelector('.code-block .line > span')).toBeTruthy(),
    )
    first.unmount()
    const { container } = render(<Markdown text={'```ts\nconst a = 1\n```'} />)
    expect(container.querySelector('.code-block .line > span')).toHaveStyle({
      color: 'var(--color-code-token-keyword)',
    })
  })

  it('shows code in a language it does not know as plain text', async () => {
    const { container } = render(<Markdown text={'```nonsense\nsome words\n```'} />)
    await waitFor(() =>
      expect(container.querySelector('.code-block')).toHaveTextContent('some words'),
    )
  })

  it('completes the Markdown a stream leaves half written', () => {
    const bold = render(<Markdown text="Use **spacers and" streaming />)
    expect(bold.container.querySelector('strong')).toHaveTextContent('spacers and')
    bold.unmount()
    // A link still being written reads as its text, with nowhere to go yet.
    const { container } = render(<Markdown text="See [the guide](https://exa" streaming />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container).toHaveTextContent('See the guide')
  })

  it('leaves Markdown as written once the text is done', () => {
    const { container } = render(<Markdown text="Prices start at 5* and go up" />)
    expect(container.querySelector('em, strong')).toBeNull()
  })

  it('offers no Copy for a code block whose fence is still streaming', () => {
    render(<Markdown text={'```ts\nconst a ='} streaming />)
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('renders math between double dollars once KaTeX loads', async () => {
    const { container } = render(<Markdown text={'$$x^2$$'} />)
    await waitFor(() => expect(container.querySelector('.katex')).not.toBeNull())
  })

  it('shows HTML in the text as the text it is, never as elements', () => {
    const { container } = render(<Markdown text={'<b>bold</b> <img src="https://x.test/a.png">'} />)
    expect(container.querySelector('b, img')).toBeNull()
    expect(container).toHaveTextContent('<b>bold</b>')
  })

  it('downloads a code block as a file named for its language', async () => {
    const user = userEvent.setup()
    const saved = catchDownload()
    render(<Markdown text={'```python\nprint(1)\n```'} />)
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(saved.filename).toBe('code.py')
    expect(await saved.blob?.text()).toBe('print(1)')
  })

  it('offers no Download for a code block whose fence is still streaming', () => {
    render(<Markdown text={'```ts\nconst a ='} streaming />)
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('copies a table as Markdown, CSV, or TSV from its Copy menu', async () => {
    const user = userEvent.setup()
    render(<Markdown text={table} />)
    await user.click(screen.getByRole('button', { name: 'Copy table' }))
    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(await navigator.clipboard.readText()).toBe('Room,Cost\n"Bath, upstairs",380')
    expect(screen.getByRole('button', { name: 'Copied' })).toHaveFocus()
    // The menu closed once it had copied.
    expect(screen.queryByRole('button', { name: 'TSV' })).toBeNull()
  })

  it('downloads a table as CSV from its Download menu', async () => {
    const user = userEvent.setup()
    const saved = catchDownload()
    render(<Markdown text={table} />)
    await user.click(screen.getByRole('button', { name: 'Download table' }))
    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(saved.filename).toBe('table.csv')
    expect(await saved.blob?.text()).toBe('Room,Cost\n"Bath, upstairs",380')
  })
})
